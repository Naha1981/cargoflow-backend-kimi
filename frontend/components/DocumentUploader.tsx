"use client";

import { useState, useCallback } from "react";
import { api } from "@lib/api";

interface DocumentUploaderProps {
  onUpload?: (result: { runId: string; filePath: string; filename: string }) => void;
}

export function DocumentUploader({ onUpload }: DocumentUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      alert("File too large (max 50MB)");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/bmp",
      "image/tiff",
    ];
    if (!allowedTypes.includes(file.type)) {
      alert("Unsupported file type");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        setProgress(50);
        const result = await api.uploadDocument(base64, file.name, file.type);
        setProgress(100);
        onUpload?.(result);
        setUploading(false);
      };
    } catch (err) {
      alert("Upload failed");
      setUploading(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [onUpload]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <p className="text-sm font-medium">
          {uploading ? `Uploading... ${progress}%` : "Drop a file here or click to upload"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG up to 50MB</p>
      </label>
      {uploading && (
        <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
