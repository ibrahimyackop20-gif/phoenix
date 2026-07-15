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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../../../lib/supabaseClient";
import FileUploader from "../../../components/FileUploader";
import AddressPickerMap from "../../../components/AddressPickerMap";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

// PDF page count is parsed fully on-device (no network round trip). Earlier this
// data flowed through a local dev-only "/api/pdf-pages" route reached over a
// hardcoded http://<ip>:8081 URL; that request only ever worked by coincidence
// (Metro must run on port 8081, and Android must allow cleartext HTTP to a LAN
// IP, which it doesn't by default) and doesn't exist at all in production
// builds. Parsing locally removes that failure point entirely.
const fallbackParsePagesCount = (text: string): number => {
  // Strategy 1: Traverse PDF structure Trailer -> Root -> Pages -> Count
  try {
    const rootRegex = /\/Root\s*(\d+)\s*0\s*R/i;
    const rootMatch = rootRegex.exec(text);
    if (rootMatch) {
      const rootObjNum = rootMatch[1];
      const rootObjRegex = new RegExp(`${rootObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`, "i");
      const rootObjMatch = rootObjRegex.exec(text);
      if (rootObjMatch) {
        const rootObjText = rootObjMatch[0];
        const pagesRefRegex = /\/Pages\s*(\d+)\s*0\s*R/i;
        const pagesRefMatch = pagesRefRegex.exec(rootObjText);
        if (pagesRefMatch) {
          const pagesObjNum = pagesRefMatch[1];
          const pagesObjRegex = new RegExp(`${pagesObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`, "i");
          const pagesObjMatch = pagesObjRegex.exec(text);
          if (pagesObjMatch) {
            const pagesObjText = pagesObjMatch[0];
            const countRegex = /\/Count\s*(\d+)/i;
            const countMatch = countRegex.exec(pagesObjText);
            if (countMatch) {
              return parseInt(countMatch[1], 10);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("PDF structural traversal failed, using fallback regex strategies:", err);
  }

  // Strategy 2: Search for Count directly under /Type /Pages
  const pagesPattern1 = /\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)/g;
  const pagesPattern2 = /\/Count\s*(\d+)[\s\S]*?\/Type\s*\/Pages/g;

  let match = pagesPattern1.exec(text);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  match = pagesPattern2.exec(text);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  // Strategy 3: Find the maximum /Count value in structural objects
  const countPattern = /\/Count\s*(\d+)/g;
  let maxPages = 0;
  let countMatch;
  while ((countMatch = countPattern.exec(text)) !== null) {
    const val = parseInt(countMatch[1], 10);
    if (val > maxPages) {
      maxPages = val;
    }
  }
  if (maxPages > 0) {
    return maxPages;
  }

  // Strategy 4: Count instances of individual /Type /Page objects
  const pagePattern = /\/Type\s*\/Page\b/g;
  const matches = text.match(pagePattern);
  if (matches && matches.length > 0) {
    return matches.length;
  }

  return 1;
};

const countPdfPages = async (fileUri: string): Promise<number> => {
  try {
    const response = await fetch(fileUri);
    const text = await response.text();
    const pages = fallbackParsePagesCount(text);
    if (pages > 0) {
      return pages;
    }
    throw new Error("لم يتم العثور على أي صفحات في الملف");
  } catch (err: any) {
    console.error("PDF parsing error:", err);
    throw new Error(`فشل قراءة صفحات ملف PDF: ${err.message}`);
  }
};

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
  const styles = getStyles(themeColors, isDark);
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
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
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

  const loadData = async () => {
    try {
      // 1. Fetch pricing configurations (Ungated)
      const { data: pricingData } = await supabase
        .from("print_pricing")
        .select("*")
        .order("category", { ascending: true });

      if (pricingData && pricingData.length > 0) {
        console.log("Downloaded raw pricing records count:", pricingData.length);
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
        console.log("Mapped pricing records:", mappedPrices);
        setAllPrices(mappedPrices);
        const firstA4 = mappedPrices.find((p) => p.category === "A4");
        if (firstA4) {
          console.log("Setting default selectedPaperTypeId:", firstA4.id);
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
        setDeliveryFees(feesData as DeliveryFeeRow[]);
        if (feesData.length > 0) setSelectedFeeId(feesData[0].id);
      }
    } catch (err) {
      console.error("Error launching printer form:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    if (appliedCoupon.discount_type === "percentage") {
      return Math.round((printSubtotal * appliedCoupon.discount_value) / 100);
    }
    return Math.min(appliedCoupon.discount_value, printSubtotal);
  }, [appliedCoupon, printSubtotal]);

  const totalPrice = useMemo(() => {
    return Math.max(0, printSubtotal - couponDiscount) + deliveryFee;
  }, [printSubtotal, couponDiscount, deliveryFee]);

  // Dynamic pricing calculation step logger
  useEffect(() => {
    if (pricesLoaded) {
      console.log("[Pricing Calculation Flow Log]");
      console.log("- Selected Paper Name (Type):", selectedPaper?.paper_type || "None");
      console.log("- Selected Paper Size (Category):", orderMode === "a4" ? "A4" : "Roll");
      console.log("- Selected Color Mode:", orderMode === "a4" ? colorMode : "N/A (Roll)");
      console.log("- Selected Sided Option:", orderMode === "a4" ? printSides : "N/A (Roll)");
      console.log("- Copies Count:", numCopies);
      console.log("- Detected PDF Pages Count (Telegram):", numPages);
      console.log("- File Mode Uploaded Files details:", uploadedFiles.map(f => ({ name: f.name, pages: f.numPages })));
      console.log("- Single page/meter rate:", selectedPriceIqd);
      console.log("- A4 page resolved rate:", a4PricePerPage);
      console.log("- Calculated Subtotal Price:", printSubtotal);
      console.log("- Calculated Grand Total Price:", totalPrice);
    }
  }, [
    pricesLoaded,
    selectedPaper,
    orderMode,
    colorMode,
    printSides,
    numCopies,
    numPages,
    uploadedFiles,
    selectedPriceIqd,
    a4PricePerPage,
    printSubtotal,
    totalPrice
  ]);

  // Extract page count numbers from Telegram bots code
  const handleTelegramCodeChange = (val: string) => {
    setExternalFileLink(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setNumPages(1);
      return;
    }

    if (trimmed.startsWith("http")) return;

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
    }
  };

  const handleFileSelect = async (selectedFile: any) => {
    if (!selectedFile) return;

    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    let pages = 1;

    if (isPdf) {
      showToast("جاري تحليل صفحات الملف...");
      try {
        pages = await countPdfPages(selectedFile.uri);
      } catch (err: any) {
        showToast(err.message || "فشل قراءة صفحات ملف PDF", "error");
        return;
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
    showToast("تمت إضافة الملف بنجاح");
  };

  const updateFilePages = (id: string, pages: number) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, numPages: Math.max(1, pages) } : f))
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
        setPromoError("كود الخصم هذا غير صالح أو منتهي الصلاحية");
        setPromoLoading(false);
        return;
      }

      if (data.target_type !== "printing") {
        setPromoError("هذا الكوبون غير صالح لطلبات الطباعة");
        setPromoLoading(false);
        return;
      }

      if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
        setPromoError("الكوبون منتهي الصلاحية");
        setPromoLoading(false);
        return;
      }

      if (data.min_order_amount && printSubtotal < data.min_order_amount) {
        setPromoError(`الحد الأدنى للاستفادة من الكوبون هو ${data.min_order_amount} د.ع`);
        setPromoLoading(false);
        return;
      }

      setAppliedCoupon({
        code: data.code,
        discount_value: data.discount_value,
        discount_type: data.discount_type,
      });
      setPromoError("");
      showToast("تم تطبيق الكوبون بنجاح!");
    } catch (err) {
      console.error(err);
      setPromoError("فشل التحقق من الكوبون");
    } finally {
      setPromoLoading(false);
    }
  };

  const copyPaymentNumber = (num: string) => {
    Clipboard.setString(num);
    showToast("تم نسخ الرقم إلى الحافظة");
  };

  const handleReceiptPicker = async () => {
    if (!currentUser) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
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
        showToast("فشل رفع إيصال الدفع الإلكتروني", "error");
        setUploadingReceipt(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      setReceiptUrl(urlData.publicUrl);
      showToast("تم رفع إيصال التحويل بنجاح");
    } catch (err) {
      console.error(err);
      showToast("فشل اختيار صورة الإيصال", "error");
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Create new delivery address
  const handleCreateAddress = async () => {
    if (!newArea.trim() || !newPhone.trim()) {
      showToast("الرجاء إدخال المنطقة ورقم الهاتف", "error");
      return;
    }

    if (!IRAQI_PHONE_REGEX.test(newPhone.trim())) {
      showToast("يرجى إدخال رقم هاتف عراقي صالح (مثال: 07701234567)", "error");
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
        showToast(`فشل إضافة العنوان: ${error.message}`, "error");
      } else {
        setAddresses((prev) => [data, ...prev]);
        setSelectedAddressId(data.id);
        setShowAddressModal(false);
        setNewArea("");
        setNewLandmark("");
        setNewPhone("");
        setNewLat(null);
        setNewLng(null);
        showToast("تمت إضافة عنوان التوصيل بنجاح");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAddress(false);
    }
  };

  // Submit print order
  const handleSubmitOrder = async () => {
    if (submitting) return;

    if (fileMode === "file" && uploadedFiles.length === 0) {
      showToast("يرجى اختيار ملف الطباعة أولاً", "error");
      return;
    }

    if (fileMode === "telegram" && !externalFileLink.trim()) {
      showToast("يرجى إدخال كود التليجرام الخاص بالملف", "error");
      return;
    }

    if (deliveryOption === "delivery" && !selectedAddressId) {
      showToast("يرجى اختيار أو إضافة عنوان توصيل", "error");
      return;
    }

    if (paymentMethod === "electronic" && !receiptUrl) {
      showToast("يرجى رفع صورة إيصال التحويل لإتمام الدفع", "error");
      return;
    }

    if (paymentMethod === "wallet" && balance < totalPrice) {
      showToast("رصيدك الحالي غير كافٍ لإتمام الدفع من المحفظة", "error");
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
            showToast(`فشل قراءة الملف من الجهاز: ${fetchErr?.message}`, "error");
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
            showToast(`فشل رفع ملف الطباعة (${uf.name}): ${upErr.message}`, "error");
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
        showToast(`فشل إرسال الطلب: ${insertError.message}`, "error");
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

      // Send admin notification
      await supabase.from("notifications").insert({
        user_id: currentUser.id,
        title: "تم استلام طلبك للطباعة 🖨️",
        message: `تم تقديم طلب الطباعة الجديد بنجاح بقيمة ${totalPrice.toLocaleString()} د.ع وجاري التحقق من تفاصيل الملف.`,
        is_read: false,
      });

      showToast("تم إرسال طلب الطباعة الخاص بك بنجاح!");
      setTimeout(() => {
        router.push("/dashboard/orders" as any);
      }, 1500);
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ غير متوقع", "error");
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
                  console.log("[Map Modal Flow Log] Address Modal Close Icon Pressed");
                  console.log("- Reason for closing: User cancelled address creation form");
                  setShowAddressModal(false);
                  setShowMap(false);
                }}
              >
                <Feather name="x" size={20} color="#a1a1aa" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>إضافة عنوان توصيل جديد</Text>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>نوع العنوان</Text>
              <View style={styles.titlesRow}>
                {ADDRESS_TITLES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setNewTitle(t)}
                    style={[styles.titleTab, newTitle === t && styles.titleTabActive]}
                  >
                    <Text style={[styles.titleTabText, newTitle === t && styles.titleTabTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>المنطقة والشارع *</Text>
                <TextInput
                  value={newArea}
                  onChangeText={setNewArea}
                  placeholder="مثال: الكرادة، شارع العرصات"
                  placeholderTextColor="#71717a"
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>أقرب نقطة دالة *</Text>
                <TextInput
                  value={newLandmark}
                  onChangeText={setNewLandmark}
                  placeholder="مثال: قرب صيدلية النخبة"
                  placeholderTextColor="#71717a"
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>رقم هاتف مستلم الطلب *</Text>
                <TextInput
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  placeholder="07XXXXXXXXX"
                  placeholderTextColor="#71717a"
                  style={styles.modalInput}
                  textAlign="right"
                />
              </View>

              {/* Coordinates Map Picker overlay toggle */}
              <TouchableOpacity
                onPress={() => {
                  const targetState = !showMap;
                  console.log("[Map Modal Flow Log] Toggle Map Coordinates Pressed");
                  console.log("- State before toggle: showMap =", showMap);
                  console.log("- Coordinates before toggle: lat =", newLat, ", lng =", newLng);
                  setShowMap(targetState);
                  console.log("- State after toggle: showMap =", targetState);
                }}
                style={styles.mapToggleButton}
              >
                <Feather name="map-pin" size={14} color="#ea580c" style={styles.buttonIcon} />
                <Text style={styles.mapToggleButtonText}>
                  {newLat ? "تغيير إحداثيات الخريطة (تم التحديد)" : "تحديد الموقع الجغرافي من الخريطة"}
                </Text>
              </TouchableOpacity>

              {showMap && (
                <View style={{ marginBottom: 16 }}>
                  <View style={styles.mapSection}>
                    <AddressPickerMap
                      initialLat={newLat ? parseFloat(newLat) : undefined}
                      initialLng={newLng ? parseFloat(newLng) : undefined}
                      onLocationSelect={(data) => {
                        console.log("[Map Component Callback] Location updated in form:", data);
                        setNewLat(String(data.lat));
                        setNewLng(String(data.lng));
                        setNewArea(data.area || newArea);
                        setNewLandmark(data.formattedAddress || newLandmark);
                      }}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      console.log("[Map Modal Flow Log] Confirm Selection Pressed");
                      console.log("- Reason for closing: User confirmed coordinates");
                      console.log("- Confirmed coordinates: lat =", newLat, ", lng =", newLng);
                      console.log("- Address fields updated: area =", newArea, ", landmark =", newLandmark);
                      setShowMap(false);
                    }}
                    style={[styles.primaryButtonCompact, { marginTop: 0, backgroundColor: "#22c55e" }]}
                  >
                    <Text style={styles.buttonTextCompact}>تأكيد الموقع الحالي ✓</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={handleCreateAddress}
                disabled={savingAddress}
                style={styles.primaryButtonCompact}
              >
                {savingAddress ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.buttonTextCompact}>حفظ العنوان</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>طلب طباعة جديد</Text>
          <Text style={styles.subtitle}>ارفع ملفك أو أدخل رمز البوت الخاص بك لتجهيز الطباعة</Text>
        </View>

        {/* Mode Selector */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            onPress={() => setOrderMode("roll")}
            style={[styles.modeButton, orderMode === "roll" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, orderMode === "roll" && styles.modeButtonTextActive]}>رول (مخططات/بوسترات)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOrderMode("a4")}
            style={[styles.modeButton, orderMode === "a4" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, orderMode === "a4" && styles.modeButtonTextActive]}>مستندات (A4)</Text>
          </TouchableOpacity>
        </View>

        {/* File Mode Selector */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            onPress={() => setFileMode("telegram")}
            style={[styles.modeButton, fileMode === "telegram" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, fileMode === "telegram" && styles.modeButtonTextActive]}>رمز التليجرام Bot Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFileMode("file")}
            style={[styles.modeButton, fileMode === "file" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, fileMode === "file" && styles.modeButtonTextActive]}>رفع ملف مباشر</Text>
          </TouchableOpacity>
        </View>

        {/* File upload block */}
        <View style={styles.glassCard}>
          {fileMode === "file" ? (
            <View>
              <FileUploader
                file={null}
                onFileSelect={handleFileSelect}
              />
              {uploadedFiles.length > 0 && (
                <View style={styles.filesListContainer}>
                  <Text style={styles.filesListTitle}>الملفات المرفوعة ({uploadedFiles.length})</Text>
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
                            <Text style={styles.fileDetailLabel}>سعر الصفحة</Text>
                            <Text style={styles.fileDetailValue}>
                              {filePrice.toLocaleString()} د.ع
                            </Text>
                          </View>
                          
                          <View style={styles.fileDetailCol}>
                            <Text style={styles.fileDetailLabel}>النسخ</Text>
                            <Text style={styles.fileDetailValue}>{numCopies}</Text>
                          </View>
                          
                          <View style={styles.fileDetailCol}>
                            <Text style={styles.fileDetailLabel}>الصفحات</Text>
                            {uf.isPdf ? (
                              <View style={styles.readOnlyPagesBadge}>
                                <Text style={styles.readOnlyPagesText}>{uf.numPages}</Text>
                                <Feather name="lock" size={10} color="#71717a" style={{ marginRight: 4 }} />
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
                          <Text style={styles.fileSubtotalLabel}>المجموع الفرعي:</Text>
                          <Text style={styles.fileSubtotalValue}>
                            {fileSubtotal.toLocaleString()} د.ع
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
              <Text style={styles.blockTitle}>كود بوت التليجرام</Text>
              <Text style={styles.blockSubtitle}>
                أدخل الكود أو الرابط المستلم من بوت تليجرام phoenix_print_bot
              </Text>
              <TextInput
                value={externalFileLink}
                onChangeText={handleTelegramCodeChange}
                placeholder="مثال: phoenix_12345_pg_32"
                placeholderTextColor="#71717a"
                style={styles.telegramInput}
                textAlign="right"
              />
            </View>
          )}

          {/* Description */}
          <View style={styles.inputGroupSpacer}>
            <Text style={styles.inputLabel}>ملاحظات أو تفاصيل إضافية</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="مثال: تغليف حلزوني، طباعة غلاف كرتوني..."
              placeholderTextColor="#71717a"
              multiline
              numberOfLines={3}
              style={styles.descriptionInput}
              textAlign="right"
            />
          </View>
        </View>

        {/* Paper Dimensions Parameters */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>خيارات الطباعة والورق</Text>

          {/* Paper Type Grid */}
          <Text style={styles.inputLabel}>نوع الورق</Text>
          {pricesLoaded ? (
            <View style={styles.paperList}>
              {activePaperTypes.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPaperTypeId(p.id)}
                  style={[styles.paperItem, selectedPaperTypeId === p.id && styles.paperItemActive]}
                >
                  <Text style={[styles.paperLabel, selectedPaperTypeId === p.id && styles.paperLabelActive]}>
                    {p.display_name_ar}
                  </Text>
                  <Text style={styles.paperPriceText}>{p.price_per_meter} د.ع / صفحة</Text>
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
                <Text style={styles.paramLabel}>الطباعة على الوجهين</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    onPress={() => setPrintSides("double")}
                    style={[styles.toggleBtn, printSides === "double" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, printSides === "double" && styles.toggleBtnTextActive]}>وجهين</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPrintSides("single")}
                    style={[styles.toggleBtn, printSides === "single" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, printSides === "single" && styles.toggleBtnTextActive]}>وجه واحد</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>الألوان</Text>
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    onPress={() => setColorMode("color")}
                    style={[styles.toggleBtn, colorMode === "color" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, colorMode === "color" && styles.toggleBtnTextActive]}>ملون</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setColorMode("bw")}
                    style={[styles.toggleBtn, colorMode === "bw" && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, colorMode === "bw" && styles.toggleBtnTextActive]}>أسود وأبيض</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {fileMode === "telegram" ? (
                <View style={styles.paramRow}>
                  <Text style={styles.paramLabel}>عدد الصفحات الكلي</Text>
                  <View style={styles.counterRow}>
                    <TouchableOpacity onPress={() => setNumPages(Math.max(1, numPages - 1))} style={styles.counterBtn}>
                      <Feather name="minus" size={14} color="#f4f4f5" />
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>{numPages}</Text>
                    <TouchableOpacity onPress={() => setNumPages(numPages + 1)} style={styles.counterBtn}>
                      <Feather name="plus" size={14} color="#f4f4f5" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.paramRow}>
                  <Text style={styles.paramLabel}>إجمالي عدد الصفحات</Text>
                  <View style={styles.readOnlyPagesBadgeGlobal}>
                    <Text style={styles.readOnlyPagesTextGlobal}>
                      {uploadedFiles.reduce((sum, f) => sum + f.numPages, 0)} صفحة
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.paramRow}>
                <Text style={styles.paramLabel}>عدد النسخ المطلوبة</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity onPress={() => setNumCopies(Math.max(1, numCopies - 1))} style={styles.counterBtn}>
                    <Feather name="minus" size={14} color="#f4f4f5" />
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{numCopies}</Text>
                  <TouchableOpacity onPress={() => setNumCopies(numCopies + 1)} style={styles.counterBtn}>
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
                <Text style={styles.paramLabel}>عرض الرول</Text>
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
                <Text style={styles.paramLabel}>الطول بالمتر</Text>
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
          <Text style={styles.cardHeaderTitle}>طريقة الاستلام</Text>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              onPress={() => setDeliveryOption("delivery")}
              style={[styles.modeButton, deliveryOption === "delivery" && styles.modeButtonActive]}
            >
              <Text style={[styles.modeButtonText, deliveryOption === "delivery" && styles.modeButtonTextActive]}>
                توصيل للمنزل
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeliveryOption("pickup")}
              style={[styles.modeButton, deliveryOption === "pickup" && styles.modeButtonActive]}
            >
              <Text style={[styles.modeButtonText, deliveryOption === "pickup" && styles.modeButtonTextActive]}>
                استلام من المكتب
              </Text>
            </TouchableOpacity>
          </View>

          {deliveryOption === "delivery" && (
            <View style={styles.deliverySection}>
              {/* Region fee selector */}
              <Text style={styles.inputLabel}>منطقة التوصيل</Text>
              <View style={styles.feeSelectorRow}>
                {deliveryFees.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setSelectedFeeId(f.id)}
                    style={[styles.feeSelectorBox, selectedFeeId === f.id && styles.feeSelectorBoxActive]}
                  >
                    <Text style={styles.feeAreaName}>{f.area_name}</Text>
                    <Text style={styles.feeAmountText}>{f.fee_amount} د.ع</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Select existing addresses */}
              <View style={styles.addressSelectHeader}>
                <TouchableOpacity onPress={() => setShowAddressModal(true)} style={styles.addAddressBtn}>
                  <Feather name="plus" size={12} color="#ea580c" style={styles.buttonIcon} />
                  <Text style={styles.addAddressBtnText}>عنوان جديد</Text>
                </TouchableOpacity>
                <Text style={styles.inputLabel}>اختر عنوان التوصيل</Text>
              </View>

              {addresses.length === 0 ? (
                <Text style={styles.noAddressText}>لا توجد عناوين مسجلة، يرجى إضافة عنوان جديد</Text>
              ) : (
                <View style={styles.addressList}>
                  {addresses.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => setSelectedAddressId(a.id)}
                      style={[styles.addressItem, selectedAddressId === a.id && styles.addressItemActive]}
                    >
                      <Text style={styles.addressItemTitle}>{a.title}</Text>
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
          <Text style={styles.cardHeaderTitle}>كود خصم (كوبون)</Text>
          <View style={styles.promoFormRow}>
            <TouchableOpacity onPress={validateCoupon} disabled={promoLoading} style={styles.promoButton}>
              {promoLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.promoButtonText}>تطبيق</Text>
              )}
            </TouchableOpacity>
            <TextInput
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder="مثال: OFF50"
              placeholderTextColor="#71717a"
              style={styles.promoInput}
              textAlign="right"
              autoCapitalize="characters"
            />
          </View>
          {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}
          {appliedCoupon ? (
            <View style={styles.appliedCouponTag}>
              <Feather name="check" size={12} color="#34d399" />
              <Text style={styles.appliedCouponText}>تم تطبيق الكوبون {appliedCoupon.code}</Text>
            </View>
          ) : null}
        </View>

        {/* Pricing calculations details */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>تفاصيل الفاتورة</Text>
          <View style={styles.billingRow}>
            <Text style={styles.billingValue}>{printSubtotal.toLocaleString()} د.ع</Text>
            <Text style={styles.billingLabel}>تكلفة الطباعة</Text>
          </View>
          {couponDiscount > 0 ? (
            <View style={styles.billingRow}>
              <Text style={[styles.billingValue, { color: "#34d399" }]}>-{couponDiscount.toLocaleString()} د.ع</Text>
              <Text style={styles.billingLabel}>خصم الكوبون</Text>
            </View>
          ) : null}
          {deliveryOption === "delivery" ? (
            <View style={styles.billingRow}>
              <Text style={styles.billingValue}>{deliveryFee.toLocaleString()} د.ع</Text>
              <Text style={styles.billingLabel}>رسوم التوصيل</Text>
            </View>
          ) : null}
          <View style={[styles.billingRow, styles.billingTotalRow]}>
            <Text style={styles.billingTotalValue}>{totalPrice.toLocaleString()} د.ع</Text>
            <Text style={styles.billingTotalLabel}>المجموع الكلي</Text>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>طريقة الدفع</Text>
          <View style={styles.paymentMethodsRow}>
            <TouchableOpacity
              onPress={() => setPaymentMethod("electronic")}
              style={[styles.paymentMethodBox, paymentMethod === "electronic" && styles.paymentMethodActive]}
            >
              <Feather name="credit-card" size={20} color={paymentMethod === "electronic" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "electronic" && styles.paymentMethodTextActive]}>دفع إلكتروني</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod("wallet")}
              style={[styles.paymentMethodBox, paymentMethod === "wallet" && styles.paymentMethodActive]}
            >
              <Ionicons name="wallet-outline" size={20} color={paymentMethod === "wallet" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "wallet" && styles.paymentMethodTextActive]}>رصيد المحفظة</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod("cod")}
              style={[styles.paymentMethodBox, paymentMethod === "cod" && styles.paymentMethodActive]}
            >
              <Feather name="dollar-sign" size={20} color={paymentMethod === "cod" ? "#ea580c" : "#71717a"} />
              <Text style={[styles.paymentMethodLabel, paymentMethod === "cod" && styles.paymentMethodTextActive]}>الدفع عند الاستلام</Text>
            </TouchableOpacity>
          </View>

          {paymentMethod === "wallet" && (
            <View style={styles.walletDetails}>
              <Text style={styles.walletDetailsText}>رصيد محفظتك الحالي: {balance.toLocaleString()} د.ع</Text>
              {balance < totalPrice ? (
                <Text style={styles.walletDetailsError}>رصيدك الحالي غير كافٍ لتغطية تكلفة الطلب</Text>
              ) : (
                <Text style={styles.walletDetailsSuccess}>رصيدك كافٍ لإتمام الدفع</Text>
              )}
            </View>
          )}

          {paymentMethod === "electronic" && (
            <View style={styles.electronicDetails}>
              <Text style={styles.detailsTitle}>التحويل الإلكتروني</Text>
              <Text style={styles.detailsDesc}>يرجى التحويل إلى أحد الأرقام التالية وإرسال صورة إيصال التحويل:</Text>

              {zaincashNum ? (
                <View style={styles.paymentAccountRow}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={styles.paymentAccountText}>زين كاش: {zaincashNum}</Text>
                </View>
              ) : null}

              {asiaNum ? (
                <View style={styles.paymentAccountRow}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={styles.paymentAccountText}>آسيا حوالة: {asiaNum}</Text>
                </View>
              ) : null}

              {/* Receipt image picker */}
              {receiptUrl ? (
                <View style={styles.receiptPreviewWrapper}>
                  <Feather name="image" size={18} color="#34d399" />
                  <Text style={styles.receiptUploadedText}>تم رفع إيصال الدفع الإلكتروني بنجاح ✓</Text>
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
                      <Text style={styles.receiptPickerBtnText}>إرفاق صورة إيصال التحويل</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity onPress={handleSubmitOrder} disabled={submitting} style={styles.submitOrderButton}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.buttonInner}>
              <Feather name="check" size={18} color="#ffffff" style={styles.buttonIcon} />
              <Text style={styles.submitOrderButtonText}>تأكيد وإرسال طلب الطباعة</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
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
    gap: 8,
    marginBottom: 16,
  },
  titleTab: {
    flex: 1,
    height: 36,
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
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 8,
    textAlign: "right",
  },
  modalInput: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 14,
  },
  mapToggleButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
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
  mapSection: {
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  primaryButtonCompact: {
    height: 42,
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
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "flex-end",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: themeColors.text,
  },
  subtitle: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 4,
    textAlign: "right",
  },
  modeToggleRow: {
    flexDirection: "row-reverse",
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  modeButtonText: {
    color: themeColors.textMuted,
    fontSize: 12,
    fontWeight: "bold",
  },
  modeButtonTextActive: {
    color: "#ea580c",
  },
  glassCard: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  telegramBlock: {
    alignItems: "flex-end",
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 4,
  },
  blockSubtitle: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginBottom: 12,
  },
  telegramInput: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    width: "100%",
    height: 44,
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 14,
  },
  inputGroupSpacer: {
    marginTop: 16,
  },
  descriptionInput: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    color: themeColors.text,
    fontSize: 13,
    textAlignVertical: "top",
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 14,
    textAlign: "right",
  },
  paperList: {
    gap: 8,
    marginBottom: 14,
  },
  paperItem: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  paperItemActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
  },
  paperLabel: {
    color: themeColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  paperLabelActive: {
    color: "#ea580c",
  },
  paperPriceText: {
    color: themeColors.textMuted,
    fontSize: 11,
  },
  a4Params: {
    gap: 14,
  },
  paramRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paramLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  toggleGroup: {
    flexDirection: "row-reverse",
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    height: 32,
    overflow: "hidden",
  },
  toggleBtn: {
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: themeColors.background,
  },
  toggleBtnActive: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  toggleBtnText: {
    color: themeColors.textMuted,
    fontSize: 11,
  },
  toggleBtnTextActive: {
    color: "#ea580c",
    fontWeight: "bold",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    height: 32,
    overflow: "hidden",
  },
  counterBtn: {
    width: 32,
    height: 32,
    backgroundColor: themeColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 13,
    fontWeight: "bold",
  },
  rollParams: {
    gap: 14,
  },
  deliverySection: {
    marginTop: 12,
  },
  feeSelectorRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  feeSelectorBox: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    minWidth: 80,
  },
  feeSelectorBoxActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    gap: 10,
  },
  addressItem: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-end",
  },
  addressItemActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
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
    flexDirection: "row",
    gap: 10,
  },
  promoButton: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    width: 80,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  promoButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  promoInput: {
    flex: 1,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 14,
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
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  billingLabel: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  billingValue: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  billingTotalRow: {
    borderTopWidth: 1,
    borderColor: themeColors.cardBorder,
    paddingTop: 8,
    marginTop: 8,
  },
  billingTotalLabel: {
    color: themeColors.text,
    fontSize: 14,
    fontWeight: "bold",
  },
  billingTotalValue: {
    color: "#ea580c",
    fontSize: 15,
    fontWeight: "bold",
  },
  paymentMethodsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
  },
  paymentMethodBox: {
    flex: 1,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 8,
  },
  paymentMethodActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
  },
  paymentMethodLabel: {
    fontSize: 11,
    color: themeColors.textMuted,
    fontWeight: "bold",
  },
  paymentMethodTextActive: {
    color: "#ea580c",
  },
  walletDetails: {
    backgroundColor: themeColors.background,
    borderRadius: 12,
    padding: 12,
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
    backgroundColor: themeColors.background,
    borderRadius: 12,
    padding: 12,
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
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
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
    height: 40,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: themeColors.cardBorder,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  receiptPickerBtnText: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  submitOrderButton: {
    height: 48,
    backgroundColor: "#ea580c",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  submitOrderButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 4,
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
  },
  filesListContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderColor: themeColors.cardBorder,
    paddingTop: 16,
  },
  filesListTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 10,
    textAlign: "right",
  },
  fileListItem: {
    backgroundColor: themeColors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
    padding: 12,
    marginBottom: 10,
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
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    backgroundColor: themeColors.cardBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  fileDetailCol: {
    alignItems: "center",
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
    height: 20,
    fontSize: 11,
    color: themeColors.text,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 4,
    padding: 0,
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

