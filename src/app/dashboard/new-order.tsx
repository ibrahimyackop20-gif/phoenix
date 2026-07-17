import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Clipboard,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { pickDocumentWithPermission } from "../../../lib/filePermissions";
import { supabase } from "../../../lib/supabaseClient";
import FileUploader from "../../../components/FileUploader";
import LocationPickerModal from "../../../components/LocationPickerModal";
import { Feather, Ionicons, FontAwesome } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

import { countPdfPagesFromUri } from "../../../lib/pdfPageCount";
import { isPdfFile } from "../../../lib/normalizeDocumentAsset";
import {
  TELEGRAM_BOT_USERNAME,
  openTelegramBot,
  notifyTelegramAdmin,
} from "../../../lib/telegramApi";
import {
  matchDeliveryFeeForAddress,
  resolveDeliveryFeeCenters,
  type FeeCenter,
} from "../../../lib/matchDeliveryFee";

interface PricingRow {
  id: string;
  paper_type: string;
  category: string; // "Roll" | "A4"
  display_name_ar: string;
  price_per_meter: number;
  double_price: number;
  label: string;
}

type OrderMode = "roll" | "a4";
type PrintSides = "single" | "double";
type ColorMode = "bw" | "color";

interface DeliveryAddress {
  id: string;
  user_id: string;
  title: string;
  area: string;
  nearby_landmark: string;
  phone_number: string;
  latitude: string | null;
  longitude: string | null;
  formatted_address: string | null;
  created_at: string;
}

interface DeliveryFeeRow {
  id: string;
  area_name: string;
  fee_amount: number;
}

const IRAQI_PHONE_REGEX = /^07[3-9]\d{8}$/;
const ADDRESS_TITLES = ["المنزل", "العمل", "الجامعة", "أخرى"];

interface UploadedFile {
  id: string;
  name: string;
  uri: string;
  type: string;
  size: number;
  numPages: number;
  isPdf: boolean;
  rawFile: any;
}

export default function NewOrderScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;
  const styles = getStyles(themeColors, isDark, isCompact, isTablet);
  const router = useRouter();

  // Active user states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [balance, setBalance] = useState(0);

  // Order configuration
  const [orderMode, setOrderMode] = useState<OrderMode>("a4");
  const [fileMode, setFileMode] = useState<"file" | "telegram">("file");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [externalFileLink, setExternalFileLink] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "wallet" | "electronic">("cod");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [largeFileModal, setLargeFileModal] = useState<{
    visible: boolean;
    fileName?: string;
    sizeMB?: number;
  }>({ visible: false });

  // Roll states
  const [paperWidth, setPaperWidth] = useState<90 | 180>(90);
  const [length, setLength] = useState<number>(1);

  // A4 states
  const [numPages, setNumPages] = useState<number>(1);
  const [numCopies, setNumCopies] = useState<number>(1);
  const [printSides, setPrintSides] = useState<PrintSides>("single");
  const [colorMode, setColorMode] = useState<ColorMode>("bw");

  // Selection states
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string>("");
  const [allPrices, setAllPrices] = useState<PricingRow[]>([]);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Delivery states
  const [deliveryOption, setDeliveryOption] = useState<"pickup" | "delivery">("pickup");
  const [deliveryFees, setDeliveryFees] = useState<DeliveryFeeRow[]>([]);
  const [deliveryFeeCenters, setDeliveryFeeCenters] = useState<FeeCenter[]>([]);
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
  const [zoneMatchError, setZoneMatchError] = useState("");
  const [zoneMatching, setZoneMatching] = useState(false);
  const [zoneLocked, setZoneLocked] = useState(false);
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  // New Address form states
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [newTitle, setNewTitle] = useState("المنزل");
  const [newArea, setNewArea] = useState("");
  const [newLandmark, setNewLandmark] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLat, setNewLat] = useState<string | null>(null);
  const [newLng, setNewLng] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Coupon promo code states
  const [promoCode, setPromoCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");

  // System payment config values
  const [zaincashNum, setZaincashNum] = useState("");
  const [asiaNum, setAsiaNum] = useState("");

  // Submission feedback states
  const [submitting, setSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const getAddressTitleLabel = useCallback(
    (title: string) => {
      if (title === "المنزل") return t("home");
      if (title === "العمل") return t("work");
      if (title === "الجامعة") return t("university");
      return t("other");
    },
    [t]
  );

  const loadData = async () => {
    try {
      // 1. Fetch pricing configurations (Ungated)
      const { data: pricingData } = await supabase
        .from("print_pricing")
        .select("*")
        .order("category", { ascending: true });

      if (pricingData && pricingData.length > 0) {
        const mappedPrices: PricingRow[] = pricingData.map((p: {
          id: number | string;
          paper_name: string | null;
          category: string | null;
          display_name_ar: string | null;
          price_per_meter: number | null;
          double_price: number | null;
        }) => ({
          id: String(p.id),
          paper_type: p.paper_name || "",
          category: p.category || "",
          display_name_ar: p.display_name_ar || "",
          price_per_meter: Number(p.price_per_meter) || 0,
          double_price: Number(p.double_price) || 0,
          label: p.display_name_ar || "",
        }));
        setAllPrices(mappedPrices);
        const firstA4 = mappedPrices.find((p) => p.category === "A4");
        if (firstA4) {
          setSelectedPaperTypeId(firstA4.id);
        }
      } else {
        console.warn("No pricing data found in print_pricing table!");
      }
      setPricesLoaded(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.warn("No auth user session found in loadData!");
        return;
      }
      setCurrentUser(user);

      // 2. Profile balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .maybeSingle();

      setBalance(profile?.balance || 0);

      // 3. Delivery addresses
      const { data: addrData } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (addrData && addrData.length > 0) {
        setAddresses(addrData as DeliveryAddress[]);
        setSelectedAddressId(addrData[0].id);
      }

      // 4. Payment credentials
      const { data: payData } = await supabase.from("payment_settings").select("key, value");
      if (payData) {
        for (const p of payData) {
          if (p.key === "zaincash_number" && p.value) setZaincashNum(p.value);
          if (p.key === "asiahawala_number" && p.value) setAsiaNum(p.value);
        }
      }

      // 5. Regional delivery fee rates
      const { data: feesData } = await supabase
        .from("delivery_fees")
        .select("id, area_name, fee_amount")
        .order("area_name");

      if (feesData) {
        const fees = feesData as DeliveryFeeRow[];
        setDeliveryFees(fees);
        // Do not pre-select a fee — zone is auto-matched from the address.
        resolveDeliveryFeeCenters(fees)
          .then(setDeliveryFeeCenters)
          .catch(() => setDeliveryFeeCenters([]));
      }
    } catch (err) {
      console.error("Error launching printer form:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-detect delivery zone from the selected address coordinates and lock it.
  useEffect(() => {
    if (deliveryOption !== "delivery") {
      setZoneMatchError("");
      setZoneLocked(false);
      return;
    }

    if (!selectedAddressId) {
      setSelectedFeeId("");
      setZoneMatchError("");
      setZoneLocked(false);
      return;
    }

    const address = addresses.find((a) => a.id === selectedAddressId);
    if (!address) return;

    const lat = address.latitude != null ? parseFloat(String(address.latitude)) : NaN;
    const lng = address.longitude != null ? parseFloat(String(address.longitude)) : NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setSelectedFeeId("");
      setZoneLocked(false);
      setZoneMatchError(t("no_zone_no_match"));
      return;
    }

    if (deliveryFees.length === 0) return;

    // Wait until zone centers are resolved so nearest-match can run.
    if (deliveryFeeCenters.length === 0) {
      setZoneMatching(true);
      return;
    }

    setZoneMatching(true);
    const matched = matchDeliveryFeeForAddress({
      latitude: lat,
      longitude: lng,
      area: address.area,
      formattedAddress: address.formatted_address,
      fees: deliveryFees,
      centers: deliveryFeeCenters,
    });
    setZoneMatching(false);

    if (!matched) {
      setSelectedFeeId("");
      setZoneLocked(false);
      setZoneMatchError(t("no_zone_no_match"));
      return;
    }

    setSelectedFeeId(matched.id);
    setZoneLocked(true);
    setZoneMatchError("");
  }, [
    deliveryOption,
    selectedAddressId,
    addresses,
    deliveryFees,
    deliveryFeeCenters,
    t,
  ]);

  const activePaperTypes = useMemo(() => {
    return orderMode === "roll"
      ? allPrices.filter((p) => p.category === "Roll")
      : allPrices.filter((p) => p.category === "A4");
  }, [orderMode, allPrices]);

  const selectedPaper = useMemo(() => {
    return allPrices.find((p) => p.id === selectedPaperTypeId);
  }, [allPrices, selectedPaperTypeId]);

  const selectedPriceIqd = selectedPaper?.price_per_meter || 0;

  // Sync pricing categories when mode toggles
  useEffect(() => {
    const list = orderMode === "roll"
      ? allPrices.filter((p) => p.category === "Roll")
      : allPrices.filter((p) => p.category === "A4");
    if (list.length > 0 && !list.find((p) => p.id === selectedPaperTypeId)) {
      setSelectedPaperTypeId(list[0].id);
    }
  }, [orderMode, allPrices, selectedPaperTypeId]);

  const deliveryFee = useMemo(() => {
    if (deliveryOption === "pickup" || !selectedFeeId) return 0;
    return deliveryFees.find((f) => f.id === selectedFeeId)?.fee_amount || 0;
  }, [deliveryOption, selectedFeeId, deliveryFees]);

  // Total pricing calculations
  const widthMultiplier = paperWidth === 180 ? 2 : 1;
  const rollTotalPrice = Math.round(length * selectedPriceIqd * widthMultiplier);

  const a4PricePerPage = useMemo(() => {
    return printSides === "double" && selectedPaper?.double_price
      ? selectedPaper.double_price
      : selectedPriceIqd;
  }, [printSides, selectedPaper, selectedPriceIqd]);

  const printSubtotal = useMemo(() => {
    if (orderMode === "roll") {
      return rollTotalPrice;
    }
    if (fileMode === "telegram") {
      return Math.round(a4PricePerPage * numPages * numCopies);
    }
    // fileMode === "file"
    if (uploadedFiles.length > 0) {
      return uploadedFiles.reduce(
        (sum, uf) => sum + Math.round(a4PricePerPage * uf.numPages * numCopies),
        0
      );
    }
    return 0;
  }, [orderMode, rollTotalPrice, fileMode, uploadedFiles, a4PricePerPage, numPages, numCopies]);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const value = Number(appliedCoupon.discount_value) || 0;
    if (appliedCoupon.discount_type === "percentage") {
      // Percentage continues to apply to print subtotal only (unchanged).
      return Math.round((printSubtotal * value) / 100);
    }
    // Fixed IQD coupons apply to the full order (print + delivery), so a
    // 1000 IQD coupon deducts 1000 even when print alone is smaller.
    const orderBeforeDiscount = printSubtotal + deliveryFee;
    return Math.min(value, orderBeforeDiscount);
  }, [appliedCoupon, printSubtotal, deliveryFee]);

  const totalPrice = useMemo(() => {
    return Math.max(0, printSubtotal + deliveryFee - couponDiscount);
  }, [printSubtotal, couponDiscount, deliveryFee]);

  // Extract page count from Telegram bot code (same rules as web)
  const handleTelegramCodeChange = (val: string) => {
    setExternalFileLink(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setNumPages(1);
      return;
    }

    if (trimmed.startsWith("http")) {
      return;
    }

    if (trimmed.includes("_")) {
      const parts = trimmed.split("_");
      const count = Number(parts[parts.length - 1]);
      if (!isNaN(count) && count > 0) {
        setNumPages(count);
      } else {
        setNumPages(1);
      }
    } else if (trimmed.includes("-pg-")) {
      const parts = trimmed.split("-pg-");
      const count = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(count) && count > 0) {
        setNumPages(count);
      } else {
        setNumPages(1);
      }
    } else {
      setNumPages(1);
      showToast(t("no_bot_code_incomplete"), "error");
    }
  };

  const handleFileSelect = async (selectedFile: any) => {
    if (!selectedFile || analyzingFile) return;

    const isPdf = isPdfFile({
      name: String(selectedFile.name || ""),
      type: String(selectedFile.type || ""),
    });
    let pages = 1;

    if (isPdf) {
      setAnalyzingFile(true);
      try {
        pages = await countPdfPagesFromUri(selectedFile.uri);
      } catch (err: any) {
        showToast(err?.message || t("analyzing_file_error"), "error");
        return;
      } finally {
        setAnalyzingFile(false);
      }
    }

    const newFile: UploadedFile = {
      id: selectedFile.uri + "-" + Date.now(),
      name: selectedFile.name,
      uri: selectedFile.uri,
      type: selectedFile.type,
      size: selectedFile.size,
      numPages: pages,
      isPdf: isPdf,
      rawFile: selectedFile,
    };

    setUploadedFiles((prev) => [...prev, newFile]);
    showToast(t("no_file_added"));
  };

  const handleOversizedFile = (fileName: string, sizeMB: number) => {
    setLargeFileModal({ visible: true, fileName, sizeMB });
  };

  const handleOpenBotFromLargeFile = () => {
    setLargeFileModal({ visible: false });
    setFileMode("telegram");
    openTelegramBot().catch(() => showToast(t("no_open_telegram_failed"), "error"));
  };

  const updateFilePages = (id: string, pages: number) => {
    setUploadedFiles((prev) =>
      prev.map((f) => {
        // PDF page counts come from the app — never allow manual edits
        if (f.id !== id || f.isPdf) return f;
        return { ...f, numPages: Math.max(1, pages) };
      })
    );
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const validateCoupon = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");

    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", promoCode.trim().toUpperCase())
        .is("store_id", null)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        setPromoError(t("no_coupon_invalid"));
        setPromoLoading(false);
        return;
      }

      if (data.target_type !== "printing") {
        setPromoError(t("no_coupon_not_print"));
        setPromoLoading(false);
        return;
      }

      if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
        setPromoError(t("no_coupon_expired"));
        setPromoLoading(false);
        return;
      }

      if (data.min_order_amount && printSubtotal < data.min_order_amount) {
        setPromoError(t("no_coupon_min", { amount: data.min_order_amount }));
        setPromoLoading(false);
        return;
      }

      setAppliedCoupon({
        code: data.code,
        discount_value: data.discount_value,
        discount_type: data.discount_type,
      });
      setPromoError("");
      showToast(t("no_coupon_ok"));
    } catch (err) {
      console.error(err);
      setPromoError(t("no_coupon_check_fail"));
    } finally {
      setPromoLoading(false);
    }
  };

  const copyPaymentNumber = (num: string) => {
    Clipboard.setString(num);
    showToast(t("no_copied"));
  };

  const handleReceiptPicker = async () => {
    if (!currentUser) return;
    try {
      const result = await pickDocumentWithPermission({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingReceipt(true);

      const fileExtension = asset.name.split(".").pop();
      const filePath = `${currentUser.id}/print-receipt-${Date.now()}.${fileExtension}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from("products")
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: asset.mimeType || "image/jpeg",
        });

      if (upErr) {
        showToast(t("no_receipt_upload_fail"), "error");
        setUploadingReceipt(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      setReceiptUrl(urlData.publicUrl);
      showToast(t("no_receipt_upload_ok"));
    } catch (err) {
      console.error(err);
      showToast(t("no_receipt_pick_fail"), "error");
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Create new delivery address
  const handleCreateAddress = async () => {
    if (!newArea.trim() || !newPhone.trim()) {
      showToast(t("no_address_fields_required"), "error");
      return;
    }

    if (!IRAQI_PHONE_REGEX.test(newPhone.trim())) {
      showToast(t("no_phone_iraq_invalid"), "error");
      return;
    }

    setSavingAddress(true);
    try {
      const { data, error } = await supabase
        .from("delivery_addresses")
        .insert({
          user_id: currentUser.id,
          title: newTitle,
          area: newArea.trim(),
          nearby_landmark: newLandmark.trim(),
          phone_number: newPhone.trim(),
          latitude: newLat,
          longitude: newLng,
          formatted_address: `${newArea.trim()}, ${newLandmark.trim()}`,
        })
        .select()
        .single();

      if (error) {
        showToast(t("no_address_add_fail", { message: error.message }), "error");
      } else {
        setAddresses((prev) => [data, ...prev]);
        setSelectedAddressId(data.id);
        setShowAddressModal(false);
        setNewArea("");
        setNewLandmark("");
        setNewPhone("");
        setNewLat(null);
        setNewLng(null);
        showToast(t("no_address_add_ok"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAddress(false);
    }
  };

  // Submit print order
  const handleSubmitOrder = async () => {
    if (submitting || analyzingFile) return;

    if (fileMode === "file" && uploadedFiles.length === 0) {
      showToast(t("no_need_file"), "error");
      return;
    }

    if (fileMode === "telegram" && !externalFileLink.trim()) {
      showToast(t("no_need_telegram"), "error");
      return;
    }

    if (deliveryOption === "delivery" && !selectedAddressId) {
      showToast(t("no_need_address"), "error");
      return;
    }

    if (deliveryOption === "delivery" && (!selectedFeeId || zoneMatchError)) {
      showToast(t("no_zone_no_match"), "error");
      return;
    }

    if (paymentMethod === "electronic" && !receiptUrl) {
      showToast(t("no_need_receipt"), "error");
      return;
    }

    if (paymentMethod === "wallet" && balance < totalPrice) {
      showToast(t("no_wallet_low"), "error");
      return;
    }

    setSubmitting(true);

    try {
      let finalFileUrl = "";
      let finalFileName = "";
      let totalPagesCount = numPages;

      // 1. Upload main document if mode is local file
      if (fileMode === "file" && uploadedFiles.length > 0) {
        const urls: string[] = [];
        const names: string[] = [];
        let pagesSum = 0;

        for (const uf of uploadedFiles) {
          const fileExtension = uf.name.split(".").pop();
          const filePath = `${currentUser.id}/prints/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

          let response: Response;
          try {
            response = await fetch(uf.uri);
          } catch (fetchErr: any) {
            showToast(t("no_read_file_fail", { message: fetchErr?.message || "" }), "error");
            setSubmitting(false);
            return;
          }

          // supabase-js documents that Blob/File/FormData upload bodies do not
          // work reliably on React Native; ArrayBuffer must be used instead.
          // Uploading a Blob here (previous implementation) is what produced
          // "Network request failed": storage-js wraps the Blob in a FormData
          // multipart body, which RN's networking layer fails to serialize.
          const arrayBuffer = await response.arrayBuffer();

          const { error: upErr } = await supabase.storage
            .from("products")
            .upload(filePath, arrayBuffer, {
              upsert: true,
              contentType: uf.type || "application/octet-stream",
            });

          if (upErr) {
            showToast(t("no_upload_print_fail", { name: uf.name, message: upErr.message }), "error");
            setSubmitting(false);
            return;
          }

          const { data: urlData } = supabase.storage
            .from("products")
            .getPublicUrl(filePath);

          urls.push(urlData.publicUrl);
          names.push(uf.name);
          pagesSum += uf.numPages;
        }

        finalFileUrl = urls.join(",");
        finalFileName = names.join(",");
        totalPagesCount = pagesSum;
      }

      // 2. Determine shipping parameters
      const deliveryFeeValue = deliveryOption === "delivery" ? deliveryFee : 0;

      // Build structured description with all order details
      let fullDescription = description.trim();
      const paperName = selectedPaper?.display_name_ar || "";
      if (orderMode === "roll") {
        fullDescription += `\n[نوع: طباعة هندسية رول | ورق: ${paperName} | عرض: ${paperWidth}سم | طول: ${length}م]`;
      } else {
        fullDescription += `\n[نوع: طباعة A4 | ورق: ${paperName} | لون: ${colorMode === "color" ? "ملون" : "أسود وأبيض"} | طباعة: ${printSides === "double" ? "وجه وظهر" : "وجه واحد"} | صفحات: ${totalPagesCount} | نسخ: ${numCopies}]`;
      }

      const paymentStatus = paymentMethod === "wallet" ? "paid" : paymentMethod === "electronic" ? "pending_verification" : "unpaid";

      // 3. Assemble order payload aligned with production DB schema
      const payload: Record<string, any> = {
        user_id: currentUser.id,
        file_url: finalFileUrl || null,
        file_name: fileMode === "file" ? finalFileName : "Telegram File",
        external_file_link: fileMode === "telegram" ? externalFileLink.trim() : null,
        description: fullDescription.trim(),
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        status: "Pending",
        total_price: totalPrice,
        paper_type: selectedPaper?.paper_type || "",
        order_type: orderMode === "roll" ? "roll_print" : "a4_print",
        num_copies: orderMode === "roll" ? 1 : numCopies,
        a4_color_type: orderMode === "roll" ? selectedPaper?.paper_type || "" : (colorMode === "color" ? "color" : "bw"),
      };

      if (selectedAddressId) {
        payload.delivery_address_id = selectedAddressId;
      }

      if (deliveryFeeValue > 0) {
        payload.shipping_cost = deliveryFeeValue;
      }

      if (selectedFeeId) {
        const areaName = deliveryFees.find((f) => f.id === selectedFeeId)?.area_name || "";
        payload.delivery_zone = areaName;
      }

      if (orderMode === "roll") {
        payload.width_cm = paperWidth;
        payload.length_meters = length;
      } else {
        payload.total_pages = totalPagesCount;
        payload.a4_paper_type = selectedPaper?.display_name_ar || "";
        payload.a4_print_side = printSides;
      }

      if (receiptUrl) {
        payload.receipt_url = receiptUrl;
      }

      const { data: insertedOrder, error: insertError } = await supabase
        .from("orders")
        .insert(payload)
        .select()
        .maybeSingle();

      if (insertError) {
        showToast(t("no_order_fail", { message: insertError.message }), "error");
        setSubmitting(false);
        return;
      }

      // 4. Update Promo Code count if applicable
      if (appliedCoupon) {
        // Safe trigger decrement increment query on coupons
      }

      // 5. Charge wallet if selected
      if (paymentMethod === "wallet") {
        const newBalance = balance - totalPrice;
        await supabase
          .from("profiles")
          .update({ balance: newBalance })
          .eq("id", currentUser.id);
      }

      // Send in-app notification
      await supabase.from("notifications").insert({
        user_id: currentUser.id,
        title: t("no_notif_title"),
        message: t("no_notif_body", { amount: totalPrice.toLocaleString() }),
        is_read: false,
      });

      // Notify admin via Telegram (same as web — fire-and-forget)
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .maybeSingle();
      notifyTelegramAdmin({
        studentName:
          profileRow?.full_name ||
          currentUser.user_metadata?.full_name ||
          currentUser.email ||
          "غير معروف",
        totalPrice,
        fileSource:
          (fileMode === "telegram" ? externalFileLink.trim() : "") ||
          finalFileUrl ||
          "ملف مرفوع",
        orderType: orderMode === "roll" ? "roll_print" : "a4_print",
      });

      showToast(t("no_order_ok"));
      setTimeout(() => {
        router.push("/dashboard/orders" as any);
      }, 1500);
    } catch (err) {
      console.error(err);
      showToast(t("no_unexpected"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {toastMsg && (
        <View style={toastType === "success" ? styles.toastSuccess : styles.toastError}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* New Address Form Modal */}
      <Modal visible={showAddressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowAddressModal(false);
                  setShowMap(false);
                }}
              >
                <Feather name="x" size={20} color="#a1a1aa" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t("no_add_address_title")}</Text>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>{t("no_address_type")}</Text>
              <View style={styles.titlesRow}>
                {ADDRESS_TITLES.map((titleVal) => (
                  <TouchableOpacity
                    key={titleVal}
                    onPress={() => setNewTitle(titleVal)}
                    style={[styles.titleTab, newTitle === titleVal && styles.titleTabActive]}
                  >
                    <Text style={[styles.titleTabText, newTitle === titleVal && styles.titleTabTextActive]}>
                      {getAddressTitleLabel(titleVal)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("no_area_street")}</Text>
                <TextInput
                  value={newArea}
                  onChangeText={setNewArea}
                  placeholder={t("no_area_placeholder")}
                  placeholderTextColor={themeColors.textMuted}
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("no_landmark")}</Text>
                <TextInput
                  value={newLandmark}
                  onChangeText={setNewLandmark}
                  placeholder={t("no_landmark_placeholder")}
                  placeholderTextColor={themeColors.textMuted}
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("no_recipient_phone")}</Text>
                <TextInput
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  placeholder="07XXXXXXXXX"
                  placeholderTextColor={themeColors.textMuted}
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              {/* Full-screen location picker */}
              <TouchableOpacity
                onPress={() => setShowMap(true)}
                style={styles.mapToggleButton}
              >
                <Feather name="map-pin" size={14} color="#ea580c" style={styles.buttonIcon} />
                <Text style={styles.mapToggleButtonText}>🗺️ {t("no_choose_address")}</Text>
              </TouchableOpacity>
              {newLat && (newLandmark || newArea) ? (
                <Text style={styles.selectedLocationHint} numberOfLines={2}>
                  {newLandmark || newArea}
                </Text>
              ) : null}

              <LocationPickerModal
                visible={showMap}
                onClose={() => setShowMap(false)}
                initialLat={newLat ? parseFloat(newLat) : undefined}
                initialLng={newLng ? parseFloat(newLng) : undefined}
                onConfirm={(data) => {
                  setNewLat(String(data.lat));
                  setNewLng(String(data.lng));
                  setNewArea(data.area || newArea);
                  setNewLandmark(data.formattedAddress || newLandmark);
                }}
              />

              <TouchableOpacity
                onPress={handleCreateAddress}
                disabled={savingAddress}
                style={styles.primaryButtonCompact}
              >
                {savingAddress ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.buttonTextCompact}>{t("no_save_address")}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!analyzingFile}
        pointerEvents={analyzingFile ? "none" : "auto"}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("no_title")}</Text>
          <Text style={styles.subtitle}>{t("no_subtitle")}</Text>
        </View>

        {/* Mode Selector */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            onPress={() => setOrderMode("roll")}
            disabled={analyzingFile}
            style={[styles.modeButton, orderMode === "roll" && styles.modeButtonActive, analyzingFile && styles.controlDisabled]}
          >
            <Text style={[styles.modeButtonText, orderMode === "roll" && styles.modeButtonTextActive]}>{t("no_mode_roll")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOrderMode("a4")}
            disabled={analyzingFile}
            style={[styles.modeButton, orderMode === "a4" && styles.modeButtonActive, analyzingFile && styles.controlDisabled]}
          >
            <Text style={[styles.modeButtonText, orderMode === "a4" && styles.modeButtonTextActive]}>{t("no_mode_a4")}</Text>
          </TouchableOpacity>
        </View>

        {/* File Mode Selector */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            onPress={() => setFileMode("telegram")}
            disabled={analyzingFile}
            style={[styles.modeButton, fileMode === "telegram" && styles.modeButtonActive, analyzingFile && styles.controlDisabled]}
          >
            <Text style={[styles.modeButtonText, fileMode === "telegram" && styles.modeButtonTextActive]}>{t("no_mode_telegram")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFileMode("file")}
            disabled={analyzingFile}
            style={[styles.modeButton, fileMode === "file" && styles.modeButtonActive, analyzingFile && styles.controlDisabled]}
          >
            <Text style={[styles.modeButtonText, fileMode === "file" && styles.modeButtonTextActive]}>{t("no_mode_file")}</Text>
          </TouchableOpacity>
        </View>

        {/* File upload block */}
        <View style={styles.glassCard}>
          {fileMode === "file" ? (
            <View>
              <FileUploader
                file={null}
                onFileSelect={handleFileSelect}
                onOversizedFile={handleOversizedFile}
                onError={(msg) => showToast(msg, "error")}
              />
              {uploadedFiles.length > 0 && (
                <View style={styles.filesListContainer}>
                  <Text style={styles.filesListTitle}>{t("no_files_uploaded", { count: uploadedFiles.length })}</Text>
                  {uploadedFiles.map((uf) => {
                    const filePrice = a4PricePerPage;
                    const fileSubtotal = filePrice * uf.numPages * numCopies;
                    return (
                      <View key={uf.id} style={styles.fileListItem}>
                        <View style={styles.fileListHeader}>
                          <Text style={styles.fileListName} numberOfLines={1}>
                            {uf.name}
                          </Text>
                          <TouchableOpacity onPress={() => removeUploadedFile(uf.id)} style={styles.deleteFileBtn}>
                            <Feather name="trash-2" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                        
                        <View style={styles.fileDetailsRow}>
                          <View style={styles.fileDetailCol}>
                            <Text style={styles.fileDetailLabel}>{t("no_page_price")}</Text>
                            <Text style={styles.fileDetailValue}>
                              {filePrice.toLocaleString()} {t("currency")}
                            </Text>
                          </View>
                          
                          <View style={styles.fileDetailCol}>
                            <Text style={styles.fileDetailLabel}>{t("no_copies_label")}</Text>
                            <Text style={styles.fileDetailValue}>{numCopies}</Text>
                          </View>
                          
                          <View style={styles.fileDetailCol}>
                            <Text style={styles.fileDetailLabel}>{t("no_pages_label")}</Text>
                            {uf.isPdf ? (
                              <View style={styles.lockedPagesCol}>
                                <View style={styles.readOnlyPagesBadge}>
                                  <Text style={styles.readOnlyPagesText}>{uf.numPages}</Text>
                                  <Feather name="lock" size={10} color="#71717a" style={{ marginRight: 4 }} />
                                </View>
                                <Text style={styles.pagesAutoNote}>{t("pages_detected_auto")}</Text>
                              </View>
                            ) : (
                              <View style={styles.editablePagesRow}>
                                <TouchableOpacity
                                  onPress={() => updateFilePages(uf.id, uf.numPages - 1)}
                                  style={styles.pageMiniBtn}
                                >
                                  <Feather name="minus" size={10} color="#f4f4f5" />
                                </TouchableOpacity>
                                <TextInput
                                  value={String(uf.numPages)}
                                  onChangeText={(v) => {
                                    const parsed = parseInt(v, 10);
                                    updateFilePages(uf.id, isNaN(parsed) ? 1 : parsed);
                                  }}
                                  keyboardType="number-pad"
                                  style={styles.pageMiniInput}
                                  textAlign="center"
                                />
                                <TouchableOpacity
                                  onPress={() => updateFilePages(uf.id, uf.numPages + 1)}
                                  style={styles.pageMiniBtn}
                                >
                                  <Feather name="plus" size={10} color="#f4f4f5" />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>

                        <View style={styles.fileListItemFooter}>
                          <Text style={styles.fileSubtotalLabel}>{t("no_subtotal")}</Text>
                          <Text style={styles.fileSubtotalValue}>
                            {fileSubtotal.toLocaleString()} {t("currency")}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.telegramBlock}>
              <Text style={styles.blockTitle}>{t("no_telegram_title")}</Text>
              <Text style={styles.blockSubtitle}>{t("no_telegram_subtitle")}</Text>

              <TouchableOpacity
                onPress={() => {
                  openTelegramBot().catch(() =>
                    showToast(t("no_open_telegram_failed"), "error")
                  );
                }}
                style={styles.telegramBotBtn}
              >
                <FontAwesome name="telegram" size={18} color="#29b6f6" />
                <Text style={styles.telegramBotBtnText}>
                  {t("no_telegram_open", { bot: TELEGRAM_BOT_USERNAME })}
                </Text>
              </TouchableOpacity>

              <Text style={styles.telegramHint}>
                {t("no_telegram_hint", { bot: TELEGRAM_BOT_USERNAME })}
              </Text>

              <TextInput
                value={externalFileLink}
                onChangeText={handleTelegramCodeChange}
                placeholder={t("no_telegram_placeholder")}
                placeholderTextColor={themeColors.textMuted}
                style={styles.telegramInput}
                textAlign="left"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {externalFileLink.trim() ? (
                <Text style={styles.telegramCodeOk}>
                  {externalFileLink.trim().startsWith("http")
                    ? t("no_telegram_link_ok")
                    : t("no_telegram_code_ok")}
                </Text>
              ) : null}
            </View>
          )}

          {/* Description */}
          <View style={styles.inputGroupSpacer}>
            <Text style={styles.inputLabel}>{t("no_notes_label")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("no_notes_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              multiline
              numberOfLines={3}
              style={styles.descriptionInput}
              textAlign="right"
              editable={!analyzingFile}
            />
          </View>
        </View>

        {/* Paper Dimensions Parameters */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>{t("no_print_options")}</Text>

          {/* Paper Type Grid */}
          <Text style={styles.inputLabel}>{t("no_paper_type")}</Text>
          {pricesLoaded ? (
            <View style={styles.paperList}>
              {activePaperTypes.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => !analyzingFile && setSelectedPaperTypeId(p.id)}
                  disabled={analyzingFile}
                  style={[styles.paperItem, selectedPaperTypeId === p.id && styles.paperItemActive]}
                >
                  <Text style={[styles.paperLabel, selectedPaperTypeId === p.id && styles.paperLabelActive]}>
                    {p.display_name_ar}
                  </Text>
                  <Text style={styles.paperPriceText}>{p.price_per_meter} {t("currency")} / {t("no_pages_label")}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ActivityIndicator size="small" color="#ea580c" />
          )}

          {/* A4 properties */}
          {orderMode === "a4" && (
            <View style={styles.a4Params}>
              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>{t("no_duplex")}</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setPrintSides("double")}
                    disabled={analyzingFile}
                    style={[styles.toggleBtn, printSides === "double" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, printSides === "double" && styles.toggleBtnTextActive]}>{t("no_duplex_double")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setPrintSides("single")}
                    disabled={analyzingFile}
                    style={[styles.toggleBtn, printSides === "single" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, printSides === "single" && styles.toggleBtnTextActive]}>{t("no_duplex_single")}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>{t("no_colors")}</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setColorMode("color")}
                    disabled={analyzingFile}
                    style={[styles.toggleBtn, colorMode === "color" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, colorMode === "color" && styles.toggleBtnTextActive]}>{t("no_color")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setColorMode("bw")}
                    disabled={analyzingFile}
                    style={[styles.toggleBtn, colorMode === "bw" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, colorMode === "bw" && styles.toggleBtnTextActive]}>{t("no_bw")}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {fileMode === "telegram" ? (
                <View style={styles.paramRow}>
                  <Text style={styles.paramLabel}>{t("no_total_pages")}</Text>
                  <View style={styles.lockedPagesCol}>
                    <View style={styles.readOnlyPagesBadgeGlobal}>
                      <Feather name="lock" size={12} color="#71717a" style={{ marginLeft: 6 }} />
                      <Text style={styles.readOnlyPagesTextGlobal}>{numPages}</Text>
                    </View>
                    <Text style={styles.pagesAutoNote}>{t("pages_detected_auto")}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.paramRow}>
                  <Text style={styles.paramLabel}>{t("no_total_pages_sum")}</Text>
                  <View style={styles.readOnlyPagesBadgeGlobal}>
                    <Text style={styles.readOnlyPagesTextGlobal}>
                      {t("no_pages_unit", { count: uploadedFiles.reduce((sum, f) => sum + f.numPages, 0) })}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>{t("no_copies_needed")}</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setNumCopies(Math.max(1, numCopies - 1))}
                    disabled={analyzingFile}
                    style={styles.counterBtn}
                  >
                    <Feather name="minus" size={14} color="#f4f4f5" />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{numCopies}</Text>
                  <TouchableOpacity
                    onPress={() => !analyzingFile && setNumCopies(numCopies + 1)}
                    disabled={analyzingFile}
                    style={styles.counterBtn}
                  >
                    <Feather name="plus" size={14} color="#f4f4f5" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Roll properties */}
          {orderMode === "roll" && (
            <View style={styles.rollParams}>
              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>{t("no_roll_width")}</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    onPress={() => setPaperWidth(180)}
                    style={[styles.toggleBtn, paperWidth === 180 && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, paperWidth === 180 && styles.toggleBtnTextActive]}>180 سم</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPaperWidth(90)}
                    style={[styles.toggleBtn, paperWidth === 90 && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, paperWidth === 90 && styles.toggleBtnTextActive]}>90 سم</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>{t("no_roll_length")}</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity onPress={() => setLength(Math.max(1, length - 1))} style={styles.counterBtn}>
                    <Feather name="minus" size={14} color="#f4f4f5" />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{length}</Text>
                  <TouchableOpacity onPress={() => setLength(length + 1)} style={styles.counterBtn}>
                    <Feather name="plus" size={14} color="#f4f4f5" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Delivery Options */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>{t("no_delivery_method")}</Text>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              onPress={() => setDeliveryOption("delivery")}
              style={[styles.modeButton, deliveryOption === "delivery" && styles.modeButtonActive]}
            >
              <Text style={[styles.modeButtonText, deliveryOption === "delivery" && styles.modeButtonTextActive]}>
                {t("no_delivery")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeliveryOption("pickup")}
              style={[styles.modeButton, deliveryOption === "pickup" && styles.modeButtonActive]}
            >
              <Text style={[styles.modeButtonText, deliveryOption === "pickup" && styles.modeButtonTextActive]}>
                {t("no_pickup")}
              </Text>
            </TouchableOpacity>
          </View>

          {deliveryOption === "delivery" && (
            <View style={styles.deliverySection}>
              {/* Region fee — auto-detected from address, read-only */}
              <Text style={styles.inputLabel}>{t("no_delivery_zone")}</Text>
              {zoneMatching ? (
                <View style={styles.zoneMatchingRow}>
                  <ActivityIndicator size="small" color="#ea580c" />
                  <Text style={styles.zoneMatchingText}>{t("no_zone_detecting")}</Text>
                </View>
              ) : null}
              <View style={styles.feeSelectorRow}>
                {deliveryFees.map((f) => {
                  const isActive = selectedFeeId === f.id;
                  return (
                    <View
                      key={f.id}
                      style={[
                        styles.feeSelectorBox,
                        isActive && styles.feeSelectorBoxActive,
                        zoneLocked && !isActive && styles.feeSelectorBoxLocked,
                      ]}
                      accessibilityState={{ selected: isActive, disabled: true }}
                    >
                      <Text style={styles.feeAreaName}>{f.area_name}</Text>
                      <Text style={styles.feeAmountText}>{f.fee_amount} {t("currency")}</Text>
                    </View>
                  );
                })}
              </View>
              {zoneLocked && selectedFeeId ? (
                <Text style={styles.zoneLockedHint}>{t("no_zone_locked")}</Text>
              ) : null}
              {zoneMatchError ? (
                <Text style={styles.zoneMatchErrorText}>{zoneMatchError}</Text>
              ) : null}

              {/* Select existing addresses */}
              <View style={styles.addressSelectHeader}>
                <TouchableOpacity onPress={() => setShowAddressModal(true)} style={styles.addAddressBtn}>
                  <Feather name="plus" size={12} color="#ea580c" style={styles.buttonIcon} />
                  <Text style={styles.addAddressBtnText}>{t("no_new_address")}</Text>
                </TouchableOpacity>
                <Text style={styles.inputLabel}>{t("no_choose_address")}</Text>
              </View>

              {addresses.length === 0 ? (
                <Text style={styles.noAddressText}>{t("no_no_addresses")}</Text>
              ) : (
                <View style={styles.addressList}>
                  {addresses.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => setSelectedAddressId(a.id)}
                      style={[styles.addressItem, selectedAddressId === a.id && styles.addressItemActive]}
                    >
                      <Text style={styles.addressItemTitle}>{getAddressTitleLabel(a.title)}</Text>
                      <Text style={styles.addressItemDetail}>
                        {a.area} — {a.nearby_landmark}
                      </Text>
                      <Text style={styles.addressItemPhone}>{a.phone_number}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Coupon Discount code */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>{t("no_coupon_title")}</Text>
          <View style={styles.promoFormRow}>
            <TouchableOpacity onPress={validateCoupon} disabled={promoLoading} style={styles.promoButton}>
              {promoLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.promoButtonText}>{t("no_coupon_apply")}</Text>
              )}
            </TouchableOpacity>
            <TextInput
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder={t("no_coupon_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={styles.promoInput}
              textAlign="right"
              autoCapitalize="characters"
            />
          </View>
          {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}
          {appliedCoupon ? (
            <View style={styles.appliedCouponTag}>
              <Feather name="check" size={12} color="#34d399" />
              <Text style={styles.appliedCouponText}>{t("no_coupon_applied", { code: appliedCoupon.code })}</Text>
            </View>
          ) : null}
        </View>

        {/* Pricing calculations details */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>{t("no_invoice_title")}</Text>
          <View style={styles.billingRow}>
            <Text style={styles.billingValue}>{printSubtotal.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.billingLabel}>{t("no_print_cost")}</Text>
          </View>
          {couponDiscount > 0 ? (
            <View style={styles.billingRow}>
              <Text style={[styles.billingValue, { color: "#34d399" }]}>-{couponDiscount.toLocaleString()} {t("currency")}</Text>
              <Text style={styles.billingLabel}>{t("no_coupon_discount")}</Text>
            </View>
          ) : null}
          {deliveryOption === "delivery" ? (
            <View style={styles.billingRow}>
              <Text style={styles.billingValue}>{deliveryFee.toLocaleString()} {t("currency")}</Text>
              <Text style={styles.billingLabel}>{t("no_shipping_fee")}</Text>
            </View>
          ) : null}
          <View style={[styles.billingRow, styles.billingTotalRow]}>
            <Text style={styles.billingTotalValue}>{totalPrice.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.billingTotalLabel}>{t("no_grand_total")}</Text>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>{t("no_payment_method")}</Text>
          <View style={styles.paymentMethodsRow}>
            <TouchableOpacity
              onPress={() => setPaymentMethod("electronic")}
              style={[styles.paymentMethodBox, paymentMethod === "electronic" && styles.paymentMethodActive]}
            >
              <Feather name="credit-card" size={20} color={paymentMethod === "electronic" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "electronic" && styles.paymentMethodTextActive]}>{t("no_pay_electronic")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod("wallet")}
              style={[styles.paymentMethodBox, paymentMethod === "wallet" && styles.paymentMethodActive]}
            >
              <Ionicons name="wallet-outline" size={20} color={paymentMethod === "wallet" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "wallet" && styles.paymentMethodTextActive]}>{t("no_pay_wallet")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod("cod")}
              style={[styles.paymentMethodBox, paymentMethod === "cod" && styles.paymentMethodActive]}
            >
              <Feather name="dollar-sign" size={20} color={paymentMethod === "cod" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "cod" && styles.paymentMethodTextActive]}>{t("no_pay_cod")}</Text>
            </TouchableOpacity>
          </View>

          {paymentMethod === "wallet" && (
            <View style={styles.walletDetails}>
              <Text style={styles.walletDetailsText}>{t("no_wallet_balance", { balance: balance.toLocaleString() })}</Text>
              {balance < totalPrice ? (
                <Text style={styles.walletDetailsError}>{t("no_wallet_insufficient")}</Text>
              ) : (
                <Text style={styles.walletDetailsSuccess}>{t("no_wallet_enough")}</Text>
              )}
            </View>
          )}

          {paymentMethod === "electronic" && (
            <View style={styles.electronicDetails}>
              <Text style={styles.detailsTitle}>{t("transfer_instructions")}</Text>
              <Text style={styles.detailsDesc}>{t("send_invoice_amount")}</Text>

              {zaincashNum ? (
                <View style={styles.paymentAccountRow}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={styles.paymentAccountText}>{t("no_zaincash")}: {zaincashNum}</Text>
                </View>
              ) : null}

              {asiaNum ? (
                <View style={styles.paymentAccountRow}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={styles.paymentAccountText}>{t("no_asia")}: {asiaNum}</Text>
                </View>
              ) : null}

              {/* Receipt image picker */}
              {receiptUrl ? (
                <View style={styles.receiptPreviewWrapper}>
                  <Feather name="image" size={18} color="#34d399" />
                  <Text style={styles.receiptUploadedText}>{t("no_receipt_ok")}</Text>
                  <TouchableOpacity onPress={() => setReceiptUrl("")} style={styles.receiptRemoveBtn}>
                    <Feather name="x" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={handleReceiptPicker} disabled={uploadingReceipt} style={styles.receiptPickerBtn}>
                  {uploadingReceipt ? (
                    <ActivityIndicator size="small" color="#ea580c" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Feather name="upload" size={16} color="#71717a" style={styles.buttonIcon} />
                      <Text style={styles.receiptPickerBtnText}>{t("no_attach_receipt")}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmitOrder}
          disabled={submitting || analyzingFile}
          style={[
            styles.submitOrderButton,
            (submitting || analyzingFile) && styles.submitOrderButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.buttonInner}>
              <Feather name="check" size={18} color="#ffffff" style={styles.buttonIcon} />
              <Text style={styles.submitOrderButtonText}>{t("no_submit")}</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Large file → Telegram bot modal */}
      <Modal
        visible={largeFileModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setLargeFileModal({ visible: false })}
      >
        <View style={styles.uxModalOverlay}>
          <View style={styles.uxModalCard}>
            <View style={styles.uxModalIconWrap}>
              <Feather name="alert-triangle" size={28} color="#ea580c" />
            </View>
            <Text style={styles.uxModalTitle}>{t("large_file_title")}</Text>
            <Text style={styles.uxModalBody}>{t("large_file_body")}</Text>
            {largeFileModal.sizeMB != null ? (
              <Text style={styles.uxModalMeta}>
                {largeFileModal.fileName ? `${largeFileModal.fileName} · ` : ""}
                {largeFileModal.sizeMB} MB
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.uxModalPrimaryBtn}
              onPress={handleOpenBotFromLargeFile}
            >
              <FontAwesome name="telegram" size={18} color="#ffffff" />
              <Text style={styles.uxModalPrimaryBtnText}>{t("large_file_open_bot")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uxModalSecondaryBtn}
              onPress={() => setLargeFileModal({ visible: false })}
            >
              <Text style={styles.uxModalSecondaryBtnText}>{t("large_file_cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-screen lock while parsing PDF pages */}
      <Modal visible={analyzingFile} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.analyzingOverlay} pointerEvents="auto">
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color="#ea580c" />
            <Text style={styles.analyzingTitle}>{t("analyzing_file_title")}</Text>
            <View style={styles.analyzingSteps}>
              <Text style={styles.analyzingStep}>• {t("analyzing_file_step_pages")}</Text>
              <Text style={styles.analyzingStep}>• {t("analyzing_file_step_prepare")}</Text>
              <Text style={styles.analyzingStep}>• {t("analyzing_file_step_price")}</Text>
            </View>
            <Text style={styles.analyzingWait}>{t("analyzing_file_wait")}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any, isDark: boolean, isCompact: boolean, isTablet: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  toastSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastText: {
    color: themeColors.text,
    fontSize: 13,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
    width: "100%",
    maxWidth: isTablet ? 720 : undefined,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: themeColors.text,
  },
  modalScroll: {
    marginBottom: 20,
  },
  titlesRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  titleTab: {
    flexGrow: 1,
    flexBasis: isCompact ? "46%" : 0,
    minHeight: 36,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTabActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  titleTabText: {
    color: themeColors.textMuted,
    fontSize: 12,
    fontWeight: "bold",
  },
  titleTabTextActive: {
    color: "#ea580c",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 20,
    color: "#CBD5E1",
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "right",
    flexShrink: 1,
  },
  modalInput: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 14,
  },
  mapToggleButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    borderColor: "rgba(234, 88, 12, 0.15)",
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
    gap: 6,
  },
  mapToggleButtonText: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "bold",
  },
  selectedLocationHint: {
    color: themeColors.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: -10,
    marginBottom: 12,
    lineHeight: 16,
  },
  mapSection: {
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  primaryButtonCompact: {
    minHeight: 42,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonTextCompact: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: isCompact ? 16 : 24,
    paddingBottom: 56,
    width: "100%",
    maxWidth: isTablet ? 960 : undefined,
    alignSelf: "center",
  },
  header: {
    alignItems: "flex-end",
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#FFFFFF",
    textAlign: "right",
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: "#94A3B8",
    marginTop: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  modeToggleRow: {
    flexDirection: "row-reverse",
    backgroundColor: "#1E293B",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 6,
    marginBottom: 20,
    gap: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  modeButton: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: "#FF5A1F",
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  modeButtonText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  glassCard: {
    backgroundColor: "#1E293B",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 20,
    padding: isCompact ? 18 : 24,
    marginBottom: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  telegramBlock: {
    alignItems: "flex-end",
  },
  blockTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  blockSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#94A3B8",
    marginBottom: 16,
    textAlign: "right",
    flexShrink: 1,
  },
  telegramBotBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    minHeight: 56,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0, 136, 204, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 136, 204, 0.3)",
    marginBottom: 12,
  },
  telegramBotBtnText: {
    color: "#29b6f6",
    fontSize: 13,
    fontWeight: "700",
  },
  telegramHint: {
    width: "100%",
    textAlign: "center",
    color: "#29b6f6",
    fontSize: 11,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0, 136, 204, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(0, 136, 204, 0.15)",
    overflow: "hidden",
  },
  telegramInput: {
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    width: "100%",
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 15,
  },
  telegramCodeOk: {
    marginTop: 8,
    width: "100%",
    textAlign: "right",
    color: "#10b981",
    fontSize: 12,
    fontWeight: "600",
  },
  inputGroupSpacer: {
    marginTop: 24,
  },
  descriptionInput: {
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: "top",
  },
  cardHeaderTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 20,
    textAlign: "right",
    flexShrink: 1,
  },
  paperList: {
    gap: 12,
    marginBottom: 20,
  },
  paperItem: {
    flexDirection: isCompact ? "column" : "row-reverse",
    justifyContent: "space-between",
    alignItems: isCompact ? "flex-end" : "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 64,
  },
  paperItemActive: {
    borderColor: "#FF5A1F",
    borderWidth: 2,
    backgroundColor: "rgba(255,90,31,0.1)",
  },
  paperLabel: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  paperLabelActive: {
    color: "#FF7A45",
  },
  paperPriceText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
    textAlign: "right",
  },
  a4Params: {
    gap: 18,
  },
  paramRow: {
    flexDirection: isCompact ? "column" : "row-reverse",
    justifyContent: "space-between",
    alignItems: isCompact ? "stretch" : "center",
    gap: isCompact ? 10 : 16,
    paddingVertical: 2,
  },
  paramLabel: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  toggleGroup: {
    flexDirection: "row-reverse",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 48,
    overflow: "hidden",
    alignSelf: isCompact ? "stretch" : "auto",
    backgroundColor: "#0F172A",
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    flexGrow: isCompact ? 1 : 0,
    borderRadius: 12,
  },
  toggleBtnActive: {
    backgroundColor: "rgba(255,90,31,0.16)",
  },
  toggleBtnText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  toggleBtnTextActive: {
    color: "#FF7A45",
    fontWeight: "800",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 48,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  counterBtn: {
    width: 48,
    minHeight: 48,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    minWidth: 56,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  rollParams: {
    gap: 18,
  },
  deliverySection: {
    marginTop: 16,
  },
  feeSelectorRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  feeSelectorBox: {
    flexGrow: 1,
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    minWidth: 104,
    minHeight: 68,
    justifyContent: "center",
  },
  feeSelectorBoxActive: {
    borderColor: "#FF5A1F",
    backgroundColor: "rgba(255,90,31,0.1)",
  },
  feeSelectorBoxLocked: {
    opacity: 0.45,
  },
  zoneMatchingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  zoneMatchingText: {
    color: themeColors.textMuted,
    fontSize: 12,
    textAlign: "right",
    flex: 1,
  },
  zoneLockedHint: {
    color: themeColors.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginBottom: 12,
    lineHeight: 16,
  },
  zoneMatchErrorText: {
    color: "#ef4444",
    fontSize: 12,
    textAlign: "right",
    marginBottom: 12,
    lineHeight: 18,
  },
  feeAreaName: {
    color: themeColors.text,
    fontSize: 11,
    fontWeight: "bold",
  },
  feeAmountText: {
    color: themeColors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  addressSelectHeader: {
    flexDirection: isCompact ? "column-reverse" : "row",
    justifyContent: "space-between",
    alignItems: isCompact ? "flex-end" : "center",
    gap: 8,
    marginBottom: 10,
  },
  addAddressBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  addAddressBtnText: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "bold",
  },
  noAddressText: {
    color: themeColors.textMuted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 12,
  },
  addressList: {
    gap: 12,
  },
  addressItem: {
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-end",
  },
  addressItemActive: {
    borderColor: "#FF5A1F",
    borderWidth: 2,
    backgroundColor: "rgba(255,90,31,0.1)",
  },
  addressItemTitle: {
    color: themeColors.text,
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 4,
  },
  addressItemDetail: {
    color: themeColors.textMuted,
    fontSize: 11,
  },
  addressItemPhone: {
    color: themeColors.textMuted,
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  promoFormRow: {
    flexDirection: isCompact ? "column-reverse" : "row",
    gap: 12,
  },
  promoButton: {
    backgroundColor: "#FF5A1F",
    borderRadius: 16,
    minWidth: 104,
    width: isCompact ? "100%" : 104,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  promoButtonText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  promoInput: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 52,
    width: isCompact ? "100%" : undefined,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 15,
  },
  promoErrorText: {
    color: "#ef4444",
    fontSize: 11,
    marginTop: 6,
    textAlign: "right",
  },
  appliedCouponTag: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  appliedCouponText: {
    color: "#34d399",
    fontSize: 11,
    fontWeight: "bold",
  },
  billingRow: {
    flexDirection: isCompact ? "column" : "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 6,
  },
  billingLabel: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1,
  },
  billingValue: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    flexShrink: 1,
  },
  billingTotalRow: {
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,90,31,0.1)",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  billingTotalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    flexShrink: 1,
  },
  billingTotalValue: {
    color: "#FF7A45",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
    flexShrink: 1,
  },
  paymentMethodsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  paymentMethodBox: {
    flexGrow: 1,
    flexBasis: isCompact ? "46%" : 0,
    minWidth: isCompact ? "46%" : undefined,
    minHeight: 104,
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  paymentMethodActive: {
    borderColor: "#FF5A1F",
    borderWidth: 2,
    backgroundColor: "rgba(255,90,31,0.12)",
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentMethodLabel: {
    fontSize: 13,
    lineHeight: 19,
    color: "#94A3B8",
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  paymentMethodTextActive: {
    color: "#FF7A45",
  },
  walletDetails: {
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-end",
  },
  walletDetailsText: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  walletDetailsError: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 6,
  },
  walletDetailsSuccess: {
    fontSize: 11,
    color: "#34d399",
    marginTop: 6,
  },
  electronicDetails: {
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-end",
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 4,
  },
  detailsDesc: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginBottom: 12,
  },
  paymentAccountRow: {
    flexDirection: isCompact ? "column" : "row-reverse",
    justifyContent: "space-between",
    alignItems: isCompact ? "flex-end" : "center",
    gap: 6,
    width: "100%",
    backgroundColor: themeColors.cardBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  copyBtn: {
    padding: 4,
  },
  paymentAccountText: {
    color: themeColors.textMuted,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    flexShrink: 1,
    textAlign: "right",
  },
  receiptPreviewWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    width: "100%",
  },
  receiptUploadedText: {
    color: "#34d399",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  receiptRemoveBtn: {
    padding: 4,
  },
  receiptPickerBtn: {
    width: "100%",
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  receiptPickerBtnText: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  submitOrderButton: {
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#FF5A1F",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 24,
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  submitOrderButtonDisabled: {
    opacity: 0.55,
  },
  controlDisabled: {
    opacity: 0.45,
  },
  uxModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  uxModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#18181b",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#27272a",
    padding: 24,
    alignItems: "center",
  },
  uxModalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(234, 88, 12, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  uxModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f4f4f5",
    textAlign: "center",
    marginBottom: 10,
  },
  uxModalBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#a1a1aa",
    textAlign: "center",
    marginBottom: 10,
  },
  uxModalMeta: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 18,
  },
  uxModalPrimaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0088cc",
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  uxModalPrimaryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  uxModalSecondaryBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  uxModalSecondaryBtnText: {
    color: "#d4d4d8",
    fontSize: 14,
    fontWeight: "600",
  },
  analyzingOverlay: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 11, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  analyzingCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#18181b",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  analyzingTitle: {
    marginTop: 18,
    fontSize: 17,
    fontWeight: "800",
    color: "#f4f4f5",
    textAlign: "center",
  },
  analyzingSteps: {
    marginTop: 18,
    width: "100%",
    gap: 8,
  },
  analyzingStep: {
    fontSize: 13,
    color: "#a1a1aa",
    textAlign: "center",
  },
  analyzingWait: {
    marginTop: 20,
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
  },
  submitOrderButtonText: {
    color: "#ffffff",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  buttonIcon: {
    marginLeft: 4,
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexShrink: 1,
  },
  filesListContainer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingTop: 20,
  },
  filesListTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 10,
    textAlign: "right",
  },
  fileListItem: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    marginBottom: 12,
  },
  fileListHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  fileListName: {
    fontSize: 13,
    fontWeight: "bold",
    color: themeColors.text,
    flex: 1,
    textAlign: "right",
    marginLeft: 10,
  },
  deleteFileBtn: {
    padding: 4,
  },
  fileDetailsRow: {
    flexDirection: isCompact ? "column" : "row-reverse",
    justifyContent: "space-around",
    backgroundColor: themeColors.cardBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
    gap: isCompact ? 10 : 0,
  },
  fileDetailCol: {
    alignItems: "center",
    minWidth: isCompact ? "100%" : undefined,
  },
  fileDetailLabel: {
    fontSize: 10,
    color: themeColors.textMuted,
    marginBottom: 4,
  },
  fileDetailValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: themeColors.text,
  },
  readOnlyPagesBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  lockedPagesCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  pagesAutoNote: {
    fontSize: 10,
    color: "#71717a",
    textAlign: "right",
    maxWidth: 180,
  },
  readOnlyPagesText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#ea580c",
  },
  editablePagesRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  pageMiniBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  pageMiniInput: {
    width: 35,
    minHeight: 28,
    fontSize: 11,
    color: themeColors.text,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 2,
  },
  fileListItemFooter: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: "rgba(39, 39, 42, 0.3)",
    paddingTop: 6,
  },
  fileSubtotalLabel: {
    fontSize: 11,
    color: themeColors.textMuted,
  },
  fileSubtotalValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ea580c",
  },
  readOnlyPagesBadgeGlobal: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  readOnlyPagesTextGlobal: {
    fontSize: 13,
    fontWeight: "bold",
    color: themeColors.text,
  },
});

