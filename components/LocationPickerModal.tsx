import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getCurrentLocationWithPermission } from "../lib/locationPermissions";
import { useAppTheme } from "./ThemeProvider";
import i18n from "../i18n";

export type LocationPickerResult = {
  lat: number;
  lng: number;
  area: string;
  formattedAddress: string;
  governorate: string;
};

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: LocationPickerResult) => void;
  initialLat?: number;
  initialLng?: number;
}

const DEFAULT_LAT = 30.5085;
const DEFAULT_LNG = 47.7834;

async function reverseGeocode(
  lat: number,
  lng: number,
  lang: string
): Promise<{ area: string; formattedAddress: string; governorate: string }> {
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
    const governorate =
      addr.state || addr.province || addr.city || addr.county || "";
    return {
      area,
      formattedAddress: data.display_name || "",
      governorate,
    };
  } catch {
    return { area: "", formattedAddress: "", governorate: "" };
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

/**
 * Full-screen delivery location picker (Talabat / Careem style).
 * Location permission is requested only when "use my location" is pressed.
 */
export default function LocationPickerModal({
  visible,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
}: LocationPickerModalProps) {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const webViewRef = useRef<WebView>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ lat: number; lng: number; display_name: string }>
  >([]);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<LocationPickerResult | null>(null);

  const lat = initialLat || DEFAULT_LAT;
  const lng = initialLng || DEFAULT_LNG;
  const mapBg = isDark ? "#111827" : "#f3f4f6";
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  useEffect(() => {
    if (!visible) {
      setMapLoaded(false);
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      setError("");
      setSelected(null);
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    }
  }, [visible]);

  const applyLocation = async (latitude: number, longitude: number) => {
    setGeocoding(true);
    const geo = await reverseGeocode(latitude, longitude, i18n.language);
    setSelected({
      lat: latitude,
      lng: longitude,
      area: geo.area,
      formattedAddress: geo.formattedAddress,
      governorate: geo.governorate,
    });
    setGeocoding(false);
  };

  const scheduleGeocode = (latitude: number, longitude: number) => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(() => {
      void applyLocation(latitude, longitude);
    }, 350);
  };

  const moveMapTo = (latitude: number, longitude: number) => {
    const script = `
      (function() {
        try {
          if (typeof updateMarkerPosition === 'function') {
            updateMarkerPosition(${Number(latitude)}, ${Number(longitude)});
          }
        } catch (e) {}
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const handleGPS = async () => {
    setGpsLoading(true);
    setError("");
    try {
      const coords = await getCurrentLocationWithPermission();
      if (!coords) return;
      const { latitude, longitude } = coords;
      moveMapTo(latitude, longitude);
      await applyLocation(latitude, longitude);
    } catch {
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
    moveMapTo(result.lat, result.lng);
    void applyLocation(result.lat, result.lng);
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

          L.control.zoom({ position: 'bottomleft' }).addTo(map);

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
          if (!map || !marker) return;
          marker.setLatLng([lat, lng]);
          if (typeof map.flyTo === 'function') {
            map.flyTo([lat, lng], 17, { animate: true, duration: 1.15 });
          } else {
            map.setView([lat, lng], 17, { animate: true });
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
        scheduleGeocode(message.lat, message.lng);
      }
    } catch {
      // ignore
    }
  };

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
            <Feather name="x" size={22} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("map_pick_title")}</Text>
          <View style={styles.headerBtn} />
        </View>

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
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => selectSearchResult(item)}
                    style={styles.dropdownItem}
                  >
                    <Text style={styles.dropdownText} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.dropdownList}
              />
            </View>
          )}
        </View>

        <View style={styles.mapBorder}>
          {visible ? (
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
          ) : null}

          {!mapLoaded && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#f97316" />
            </View>
          )}

          {geocoding && (
            <View style={styles.geocodingIndicator}>
              <ActivityIndicator size="small" color="#f97316" />
              <Text style={styles.geocodingText}>{t("map_geocoding")}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleGPS}
            disabled={gpsLoading || !mapLoaded}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t("map_use_my_location")}
            style={[
              styles.myLocationFab,
              (gpsLoading || !mapLoaded) && styles.myLocationFabDisabled,
            ]}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color="#ea580c" />
            ) : (
              <Feather name="navigation" size={22} color={isDark ? "#3f3f46" : "#6b7280"} />
            )}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>{t("map_selected_label")}</Text>
          <Text style={styles.footerAddress} numberOfLines={3}>
            {selected?.formattedAddress || selected?.area || t("map_select_hint")}
          </Text>
          {selected?.area ? (
            <Text style={styles.footerArea}>{t("map_area", { area: selected.area })}</Text>
          ) : null}

          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selected}
            style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
          >
            <Text style={styles.confirmButtonText}>{t("map_confirm")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    header: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.cardBorder,
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      color: themeColors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    searchContainer: {
      marginHorizontal: 12,
      marginTop: 10,
      position: "relative",
      zIndex: 20,
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
      zIndex: 21,
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
      maxHeight: 180,
      overflow: "hidden",
      zIndex: 100,
      elevation: 6,
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
    myLocationFab: {
      position: "absolute",
      right: 16,
      bottom: 16,
      zIndex: 1100,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.28,
      shadowRadius: 4,
      elevation: 6,
    },
    myLocationFabDisabled: {
      opacity: 0.7,
    },
    mapBorder: {
      flex: 1,
      marginHorizontal: 12,
      marginTop: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      overflow: "hidden",
      position: "relative",
      minHeight: 280,
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
    geocodingText: {
      fontSize: 10,
      color: themeColors.textMuted,
    },
    errorText: {
      marginHorizontal: 12,
      marginTop: 6,
      color: "#ef4444",
      fontSize: 12,
      textAlign: "center",
    },
    footer: {
      marginTop: 10,
      paddingHorizontal: 16,
      paddingBottom: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: themeColors.cardBorder,
      backgroundColor: themeColors.background,
      gap: 6,
    },
    footerLabel: {
      color: themeColors.textMuted,
      fontSize: 12,
      textAlign: "right",
      fontWeight: "600",
    },
    footerAddress: {
      color: themeColors.text,
      fontSize: 13,
      textAlign: "right",
      lineHeight: 20,
      minHeight: 40,
    },
    footerArea: {
      color: "#f97316",
      fontSize: 12,
      textAlign: "right",
    },
    confirmButton: {
      marginTop: 8,
      backgroundColor: "#22c55e",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    confirmButtonDisabled: {
      opacity: 0.45,
    },
    confirmButtonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "700",
    },
  });
