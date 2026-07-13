export async function POST(request: Request) {
  try {
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return Response.json({ error: "Empty file buffer received" }, { status: 400 });
    }
    
    // Read buffer as binary text
    const text = Buffer.from(arrayBuffer).toString("binary");
    
    // Strategy 1: Traverse PDF structure Trailer -> Root -> Pages -> Count
    try {
      const rootRegex = /\/Root\s*(\d+)\s*0\s*R/i;
      const rootMatch = rootRegex.exec(text);
      if (rootMatch) {
        const rootObjNum = rootMatch[1];
        const rootObjRegex = new RegExp(`${rootObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`, 'i');
        const rootObjMatch = rootObjRegex.exec(text);
        if (rootObjMatch) {
          const rootObjText = rootObjMatch[0];
          const pagesRefRegex = /\/Pages\s*(\d+)\s*0\s*R/i;
          const pagesRefMatch = pagesRefRegex.exec(rootObjText);
          if (pagesRefMatch) {
            const pagesObjNum = pagesRefMatch[1];
            const pagesObjRegex = new RegExp(`${pagesObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`, 'i');
            const pagesObjMatch = pagesObjRegex.exec(text);
            if (pagesObjMatch) {
              const pagesObjText = pagesObjMatch[0];
              const countRegex = /\/Count\s*(\d+)/i;
              const countMatch = countRegex.exec(pagesObjText);
              if (countMatch) {
                return Response.json({ pages: parseInt(countMatch[1], 10) });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("API PDF structural traversal failed, using fallback regex strategies:", err);
    }

    // Strategy 2: Fallback to searching for /Type /Pages /Count N globally
    try {
      const pagesPattern1 = /\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)/gi;
      const pagesPattern2 = /\/Count\s*(\d+)[\s\S]*?\/Type\s*\/Pages/gi;
      
      let match;
      pagesPattern1.lastIndex = 0;
      while ((match = pagesPattern1.exec(text)) !== null) {
        if (match[1]) return Response.json({ pages: parseInt(match[1], 10) });
      }
      
      pagesPattern2.lastIndex = 0;
      while ((match = pagesPattern2.exec(text)) !== null) {
        if (match[1]) return Response.json({ pages: parseInt(match[1], 10) });
      }
    } catch (err) {
      console.warn("API PDF keyword matching fallback failed:", err);
    }

    // Strategy 3: Find the maximum /Count value in structural objects
    try {
      const countPattern = /\/Count\s*(\d+)/gi;
      let maxPages = 0;
      let countMatch;
      countPattern.lastIndex = 0;
      while ((countMatch = countPattern.exec(text)) !== null) {
        const val = parseInt(countMatch[1], 10);
        if (val > maxPages) {
          maxPages = val;
        }
      }
      if (maxPages > 0) {
        return Response.json({ pages: maxPages });
      }
    } catch (err) {
      console.warn("API PDF max count matching failed:", err);
    }

    // Strategy 4: Count instances of individual /Type /Page objects
    try {
      const pagePattern = /\/Type\s*\/Page\b/gi;
      const matches = text.match(pagePattern);
      if (matches && matches.length > 0) {
        return Response.json({ pages: matches.length });
      }
    } catch (err) {
      console.warn("API PDF page count matching failed:", err);
    }

    return Response.json({ error: "Failed to detect page count from PDF document structural analysis" }, { status: 500 });
  } catch (err: any) {
    console.error("PDF Parse API Route Error:", err);
    return Response.json({ error: err.message || "Failed to process PDF file" }, { status: 500 });
  }
}
