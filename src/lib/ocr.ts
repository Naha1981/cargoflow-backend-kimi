import Tesseract from "tesseract.js";
import { logger } from "./logger";

// pdf-poppler is optional; handle gracefully if not installed
let pdfToImage: ((pdfPath: string, opts: any) => Promise<string[]>) | null = null;
try {
  const poppler = require("pdf-poppler");
  pdfToImage = async (pdfPath: string, opts: any) => {
    const info = await poppler.info(pdfPath);
    const pages = info.pages || 1;
    const images: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const outPrefix = opts.out_prefix || "page";
      const outDir = opts.out_dir || "/tmp";
      const imagePath = `${outDir}/${outPrefix}-${i}.png`;
      await poppler.convert(pdfPath, { ...opts, page: i });
      images.push(imagePath);
    }
    return images;
  };
} catch {
  logger.warn("pdf-poppler not available; PDF-to-image conversion disabled");
}

/**
 * Detects if a file path is a PDF based on extension.
 */
function isPdf(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".pdf");
}

/**
 * Detects if a file path is an image.
 */
function isImage(filePath: string): boolean {
  const ext = filePath.toLowerCase();
  return ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".bmp") || ext.endsWith(".tiff") || ext.endsWith(".gif");
}

/**
 * Converts a PDF to a list of image paths (one per page).
 * Falls back gracefully if pdf-poppler is not available.
 */
export async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  if (!pdfToImage) {
    throw new Error("PDF conversion not available: pdf-poppler is not installed");
  }
  const outDir = "/tmp/cargoflow-ocr";
  await require("fs/promises").mkdir(outDir, { recursive: true });
  const outPrefix = `pdf-${Date.now()}`;

  try {
    const images = await pdfToImage(pdfPath, {
      format: "png",
      out_dir: outDir,
      out_prefix: outPrefix,
      page: null,
    });
    return images;
  } catch (err: any) {
    logger.error({ err, pdfPath }, "PDF-to-image conversion failed");
    throw new Error(`PDF conversion failed: ${err.message}`);
  }
}

/**
 * Runs Tesseract.js OCR on an image and returns the extracted text.
 */
export async function ocrImage(imagePath: string): Promise<string> {
  try {
    const result = await Tesseract.recognize(imagePath, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          logger.debug({ progress: m.progress }, "OCR progress");
        }
      },
    });
    return result.data.text;
  } catch (err: any) {
    logger.error({ err, imagePath }, "OCR failed on image");
    throw new Error(`OCR failed: ${err.message}`);
  }
}

/**
 * Full OCR pipeline.
 *
 * 1. Detects file type (PDF vs image).
 * 2. If PDF, converts pages to images via pdf-poppler.
 * 3. Runs Tesseract.js on each image.
 * 4. Concatenates text with page markers.
 *
 * Returns { text, pageCount }.
 */
export async function runOcr(filePath: string): Promise<{ text: string; pageCount: number }> {
  let imagePaths: string[] = [];

  if (isPdf(filePath)) {
    logger.info({ filePath }, "Converting PDF to images for OCR");
    imagePaths = await convertPdfToImages(filePath);
  } else if (isImage(filePath)) {
    imagePaths = [filePath];
  } else {
    throw new Error(`Unsupported file type for OCR: ${filePath}`);
  }

  const pageTexts: string[] = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const pageText = await ocrImage(imagePaths[i]);
    pageTexts.push(`--- PAGE ${i + 1} ---\n${pageText}`);
  }

  const text = pageTexts.join("\n\n");
  const pageCount = imagePaths.length;

  logger.info({ filePath, pageCount, textLength: text.length }, "OCR completed");
  return { text, pageCount };
}
