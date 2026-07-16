import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getCurrentLocationWithPermission } from "../lib/locationPermissions";
import { useAppTheme } from "./ThemeProvider";
import i18n from "../i18n";

interface LocationData {
  lat: number;
  lng: number;
  area: string;
  formattedAddress: string;
}

interface AddressPickerMapProps {
  onLocationSelect: (data: LocationData) => void;
  initialLat?: number;
  initialLng?: number;
}

const DEFAULT_LAT = 30.5085;
const DEFAULT_LNG = 47.7834;

async function reverseGeocode(
  lat: number,
  lng: number,
  lang: string
): Promise<{ area: string; formattedAddress: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${lang}&zoom=18`,
      { headers: { "User-Agent": "PhoenixPrint/1.0" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const area =
      addr.suburb ||
      addr.neighbourhood ||
      addr.city_district ||
      addr.town ||
      addr.city ||
      addr.state ||
      "";
    return {
      area,
      formattedAddress: data.display_name || "",
    };
  } catch (err) {
    console.error("🗺️ Reverse geocode error:", err);
    return { area: "", formattedAddress: "" };
  }
}

async function searchPlace(
  query: string,
  lang: string
): Promise<Array<{ lat: number; lng: number; display_name: string }>> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=iq&accept-language=${lang}&limit=5`,
      { headers: { "User-Agent": "PhoenixPrint/1.0" } }
    );
    const data = await res.json();
    return data.map((r: { lat: string; lon: string; display_name: string }) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      display_name: r.display_name,
    }));
  } catch {
    return [];
  }
}

export default function AddressPickerMap({
  onLocationSelect,
  initialLat,
  initialLng,
}: AddressPickerMapProps) {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const webViewRef = useRef<WebView>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

  const [mapLoaded, setMapLoaded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ lat: number; lng: number; display_name: string }>
  >([]);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");

  const lat = initialLat || DEFAULT_LAT;
  const lng = initialLng || DEFAULT_LNG;
  const mapBg = isDark ? "#111827" : "#f3f4f6";
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const updateLocation = async (latitude: number, longitude: number) => {
    setGeocoding(true);
    const geo = await reverseGeocode(latitude, longitude, i18n.language);
    onLocationSelectRef.current({
      lat: latitude,
      lng: longitude,
      area: geo.area,
      formattedAddress: geo.formattedAddress,
    });
    setGeocoding(false);
  };

  const handleGPS = async () => {
    setGpsLoading(true);
    setError("");
    try {
      const coords = await getCurrentLocationWithPermission();
      if (!coords) {
        setError("");
        return;
      }

      const { latitude, longitude } = coords;

      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "UPDATE_POSITION",
          lat: latitude,
          lng: longitude,
        })
      );

      await updateLocation(latitude, longitude);
    } catch (err) {
      console.error(err);
      setError(t("map_gps_error"));
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const results = await searchPlace(searchQuery, i18n.language);
    setSearchResults(results);
    setShowResults(true);
  };

  const selectSearchResult = (result: {
    lat: number;
    lng: number;
    display_name: string;
  }) => {
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "UPDATE_POSITION",
        lat: result.lat,
        lng: result.lng,
      })
    );
    updateLocation(result.lat, result.lng);
    setShowResults(false);
    setSearchQuery("");
  };

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${mapBg}; }
        .leaflet-container { background: ${mapBg}; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        var map, marker;
        var defaultLat = ${lat};
        var defaultLng = ${lng};

        function initMap() {
          map = L.map('map', {
            center: [defaultLat, defaultLng],
            zoom: 15,
            zoomControl: false,
            attributionControl: false
          });

          L.tileLayer('${tileUrl}', {
            maxZoom: 19,
            subdomains: 'abcd'
          }).addTo(map);

          L.control.zoom({ position: 'bottomright' }).addTo(map);

          var markerIcon = L.divIcon({
            html: '<div style="width:28px;height:28px;background:linear-gradient(135deg,#ea580c,#f97316);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(234,88,12,0.5);"></div>',
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          marker = L.marker([defaultLat, defaultLng], {
            icon: markerIcon,
            draggable: true
          }).addTo(map);

          marker.on('dragend', function() {
            var pos = marker.getLatLng();
            sendCoordinates(pos.lat, pos.lng);
          });

          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            sendCoordinates(e.latlng.lat, e.latlng.lng);
          });
        }

        function updateMarkerPosition(lat, lng) {
          if (marker && map) {
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng], 17);
          }
        }

        function sendCoordinates(lat, lng) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LOCATION_CHANGED',
            lat: lat,
            lng: lng
          }));
        }

        initMap();

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

  const onWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "LOCATION_CHANGED") {
        updateLocation(message.lat, message.lng);
      }
    } catch (err) {
      console.error("Error parsing WebView message:", err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          placeholder={t("map_search_placeholder")}
          placeholderTextColor={themeColors.textMuted}
          style={styles.searchInput}
          textAlign="right"
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <Feather name="search" size={16} color={themeColors.textMuted} />
        </TouchableOpacity>

        {showResults && searchResults.length > 0 && (
          <View style={styles.dropdown}>
            <FlatList
              data={searchResults}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => selectSearchResult(item)}
                  style={styles.dropdownItem}
                >
                  <Text style={styles.dropdownText} numberOfLines={2}>
                    <Feather name="map-pin" size={12} color="#f97316" />{" "}
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.dropdownList}
            />
          </View>
        )}

        {showResults && searchResults.length === 0 && (
          <View style={styles.dropdown}>
            <Text style={styles.noResultsText}>{t("map_no_results")}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={handleGPS}
        disabled={gpsLoading || !mapLoaded}
        style={styles.useMyLocationButton}
        accessibilityRole="button"
        accessibilityLabel={t("map_use_my_location")}
      >
        {gpsLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Feather name="navigation" size={16} color="#ffffff" />
        )}
        <Text style={styles.useMyLocationButtonText}>📍 {t("map_use_my_location")}</Text>
      </TouchableOpacity>

      <View style={styles.mapBorder}>
        <View style={styles.mapWrapper}>
          <WebView
            key={isDark ? "dark-map" : "light-map"}
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html: leafletHtml }}
            onLoadEnd={() => setMapLoaded(true)}
            onMessage={onWebViewMessage}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>

        {!mapLoaded && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        )}

        {geocoding && (
          <View style={styles.geocodingIndicator}>
            <ActivityIndicator size="small" color="#f97316" style={styles.spinner} />
            <Text style={styles.geocodingText}>{t("map_geocoding")}</Text>
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Feather name="map-pin" size={18} color="#ef4444" style={styles.errorIcon} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <Text style={styles.infoText}>{t("map_drag_hint")}</Text>
      )}
    </View>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    container: {
      marginVertical: 8,
      gap: 8,
    },
    searchContainer: {
      position: "relative",
      zIndex: 10,
    },
    searchInput: {
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingRight: 40,
      height: 48,
      color: themeColors.text,
      fontSize: 14,
    },
    searchButton: {
      position: "absolute",
      right: 12,
      top: 14,
      zIndex: 11,
    },
    dropdown: {
      position: "absolute",
      top: 52,
      left: 0,
      right: 0,
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 6,
      elevation: 5,
      maxHeight: 180,
      overflow: "hidden",
      zIndex: 100,
    },
    dropdownList: {
      paddingVertical: 4,
    },
    dropdownItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomColor: themeColors.cardBorder,
      borderBottomWidth: 0.5,
    },
    dropdownText: {
      color: themeColors.text,
      fontSize: 12,
      textAlign: "right",
    },
    noResultsText: {
      color: themeColors.textMuted,
      fontSize: 12,
      padding: 12,
      textAlign: "center",
    },
    mapBorder: {
      height: 250,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      overflow: "hidden",
      position: "relative",
    },
    mapWrapper: {
      flex: 1,
      backgroundColor: isDark ? "#111827" : "#f3f4f6",
    },
    webview: {
      flex: 1,
      backgroundColor: isDark ? "#111827" : "#f3f4f6",
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? "#111827" : "#f3f4f6",
      alignItems: "center",
      justifyContent: "center",
    },
    geocodingIndicator: {
      position: "absolute",
      top: 12,
      right: 12,
      zIndex: 1000,
      backgroundColor: isDark ? "rgba(31, 41, 55, 0.9)" : "rgba(255, 255, 255, 0.95)",
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
    },
    spinner: {
      transform: [{ scale: 0.8 }],
    },
    geocodingText: {
      fontSize: 10,
      color: themeColors.textMuted,
    },
    useMyLocationButton: {
      backgroundColor: "#ea580c",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    useMyLocationButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#ffffff",
      textAlign: "center",
    },
    infoText: {
      fontSize: 10,
      color: themeColors.textMuted,
      textAlign: "center",
      marginTop: 4,
    },
    errorBanner: {
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      borderColor: "rgba(239, 68, 68, 0.3)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    errorIcon: {
      marginLeft: 4,
    },
    errorText: {
      fontSize: 12,
      color: "#ef4444",
    },
  });
