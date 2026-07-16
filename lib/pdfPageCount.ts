/**
 * On-device PDF page counting.
 *
 * Do not use `response.text()` for PDF bytes on React Native. Binary PDF bodies
 * can yield `undefined`/`null` from FileReader.readAsText (UTF-8). Strategies
 * 1–3 call RegExp.exec (which coerces undefined → "undefined" and silently
 * fails); Strategy 4 calls `text.match(...)` and throws:
 * Cannot read property 'match' of undefined.
 *
 * Uploads already use arrayBuffer() successfully — reuse that read path here.
 */

const arrayBufferToBinaryString = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    out += String.fromCharCode.apply(null, Array.from(slice));
  }
  return out;
};

export const parsePdfPageCountFromBinaryString = (text: string): number => {
  if (typeof text !== "string") {
    throw new Error(`PDF parser expected binary string, got ${typeof text}`);
  }

  // Strategy 1: Trailer -> Root -> Pages -> Count
  try {
    const rootRegex = /\/Root\s*(\d+)\s*0\s*R/i;
    const rootMatch = rootRegex.exec(text);
    if (rootMatch) {
      const rootObjNum = rootMatch[1];
      const rootObjRegex = new RegExp(
        `${rootObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`,
        "i"
      );
      const rootObjMatch = rootObjRegex.exec(text);
      if (rootObjMatch) {
        const rootObjText = rootObjMatch[0];
        const pagesRefRegex = /\/Pages\s*(\d+)\s*0\s*R/i;
        const pagesRefMatch = pagesRefRegex.exec(rootObjText);
        if (pagesRefMatch) {
          const pagesObjNum = pagesRefMatch[1];
          const pagesObjRegex = new RegExp(
            `${pagesObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`,
            "i"
          );
          const pagesObjMatch = pagesObjRegex.exec(text);
          if (pagesObjMatch) {
            const countMatch = /\/Count\s*(\d+)/i.exec(pagesObjMatch[0]);
            if (countMatch) {
              return parseInt(countMatch[1], 10);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(
      "PDF structural traversal failed, using fallback regex strategies:",
      err
    );
  }

  // Strategy 2: Count under /Type /Pages
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

  // Strategy 3: Max /Count in structural objects
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

  // Strategy 4: Count /Type /Page objects
  const pagePattern = /\/Type\s*\/Page\b/g;
  const matches = text.match(pagePattern);
  if (matches && matches.length > 0) {
    return matches.length;
  }

  return 1;
};

export const countPdfPagesFromUri = async (fileUri: string): Promise<number> => {
  if (!fileUri || typeof fileUri !== "string") {
    throw new Error("مسار ملف PDF غير صالح");
  }

  try {
    const response = await fetch(fileUri);
    const buffer = await response.arrayBuffer();

    if (!buffer || buffer.byteLength === 0) {
      throw new Error("ملف PDF فارغ أو غير قابل للقراءة");
    }

    const text = arrayBufferToBinaryString(buffer);
    const pages = parsePdfPageCountFromBinaryString(text);

    if (pages > 0) {
      return pages;
    }
    throw new Error("لم يتم العثور على أي صفحات في الملف");
  } catch (err: any) {
    console.error("PDF parsing error:", err);
    throw new Error(`فشل قراءة صفحات ملف PDF: ${err.message}`);
  }
};
