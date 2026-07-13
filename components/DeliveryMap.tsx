import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";

interface DeliveryMapProps {
  onLocationSelect: (
    lat: number,
    lng: number,
    address: string,
    governorate: string
  ) => void;
  initialLat?: number;
  initialLng?: number;
}

// Iraq bounding box (approximate)
const IRAQ_BOUNDS = {
  minLat: 29.0,
  maxLat: 37.4,
  minLng: 38.7,
  maxLng: 48.6,
};

function isInsideIraq(lat: number, lng: number): boolean {
  return (
    lat >= IRAQ_BOUNDS.minLat &&
    lat <= IRAQ_BOUNDS.maxLat &&
    lng >= IRAQ_BOUNDS.minLng &&
    lng <= IRAQ_BOUNDS.maxLng
  );
}

export default function DeliveryMap({
  onLocationSelect,
  initialLat = 33.315,
  initialLng = 44.366,
}: DeliveryMapProps) {
  const webViewRef = useRef<WebView>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

  const [locating, setLocating] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [outsideIraq, setOutsideIraq] = useState(false);

  const reverseGeocode = useCallback(
    async (latitude: number, longitude: number) => {
      // Check Iraq boundary first
      if (!isInsideIraq(latitude, longitude)) {
        setOutsideIraq(true);
        return;
      }
      setOutsideIraq(false);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar&zoom=10`
        );
        const data = await res.json();
        const address =
          data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        // Extract governorate (state) from Nominatim response
        const governorate =
          data.address?.state ||
          data.address?.province ||
          data.address?.city ||
          "";

        onLocationSelectRef.current(latitude, longitude, address, governorate);
      } catch {
        onLocationSelectRef.current(
          latitude,
          longitude,
          `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          ""
        );
      }
    },
    []
  );

  const handleLocateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocating(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;

      // Update position inside Leaflet WebView
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "UPDATE_POSITION",
          lat: latitude,
          lng: longitude,
        })
      );

      await reverseGeocode(latitude, longitude);
    } catch (err) {
      console.error(err);
    } finally {
      setLocating(false);
    }
  };

  const onWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "LOCATION_CHANGED") {
        reverseGeocode(message.lat, message.lng);
      }
    } catch (err) {
      console.error("Error parsing WebView message:", err);
    }
  };

  // Leaflet map rendered dynamically from CDN in Dark Matter theme
  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #09090b; }
        .leaflet-container { background: #09090b; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        var map, marker;
        var defaultLat = ${initialLat};
        var defaultLng = ${initialLng};

        function initMap() {
          map = L.map('map', {
            center: [defaultLat, defaultLng],
            zoom: 13,
            zoomControl: false,
            attributionControl: false
          });

          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; OSM &copy; CARTO'
          }).addTo(map);

          L.control.zoom({ position: 'bottomright' }).addTo(map);

          var markerIcon = L.divIcon({
            html: '<div style="width:32px;height:32px;background:linear-gradient(135deg,#ea580c,#f97316);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 15px rgba(234,88,12,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;transform:rotate(45deg)"></div></div>',
            className: 'custom-map-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });

          // Handle map click
          map.on('click', function(e) {
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;
            if (marker) {
              marker.setLatLng([lat, lng]);
            } else {
              marker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);
            }
            sendCoordinates(lat, lng);
          });

          // Check if initial marker coordinates should be placed
          marker = L.marker([defaultLat, defaultLng], { icon: markerIcon }).addTo(map);
        }

        function updateMarkerPosition(lat, lng) {
          if (map) {
            if (marker) {
              marker.setLatLng([lat, lng]);
            }
            map.flyTo([lat, lng], 16, { duration: 1.2 });
          }
        }

        function sendCoordinates(lat, lng) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LOCATION_CHANGED',
            lat: lat,
            lng: lng
          }));
        }

        // Initialize Map
        initMap();

        // Listen to updates from React Native
        window.addEventListener('message', function(event) {
          try {
            var data = JSON.parse(event.data);
            if (data.type === 'UPDATE_POSITION') {
              updateMarkerPosition(data.lat, data.lng);
            }
          } catch(e) {}
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        <Feather name="map-pin" size={12} color="#f97316" style={styles.labelIcon} />{" "}
        حدد موقع التوصيل على الخريطة
      </Text>

      <View style={styles.mapBorder}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: leafletHtml }}
          onLoadEnd={() => setMapLoaded(true)}
          onMessage={onWebViewMessage}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />

        {!mapLoaded && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        )}

        <TouchableOpacity
          onPress={handleLocateMe}
          disabled={locating || !mapLoaded}
          style={styles.locateButton}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
          ) : (
            <Feather name="navigation" size={14} color="#ffffff" />
          )}
          <Text style={styles.locateButtonText}>حدد موقعي الحالي</Text>
        </TouchableOpacity>
      </View>

      {outsideIraq && (
        <View style={styles.warningBanner}>
          <Feather name="alert-triangle" size={16} color="#ef4444" style={styles.warningIcon} />
          <Text style={styles.warningText}>نعتذر، التوصيل متاح داخل العراق فقط</Text>
        </View>
      )}

      <Text style={styles.infoText}>
        انقر على الخريطة لتحديد نقطة التوصيل أو استخدم زر "حدد موقعي الحالي"
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#a1a1aa", // Muted color
    textAlign: "right",
    marginBottom: 4,
  },
  labelIcon: {
    marginLeft: 4,
  },
  mapBorder: {
    height: 280,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  locateButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 400,
    backgroundColor: "#ea580c", // Primary orange
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  spinner: {
    marginLeft: 2,
  },
  locateButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
  warningBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  warningIcon: {
    marginLeft: 4,
  },
  warningText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
  infoText: {
    fontSize: 10,
    color: "#71717a",
    textAlign: "center",
  },
});
