import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useRef, useState } from "react";
import { HiOutlinePaperClip } from "react-icons/hi";
import { HiCheckBadge } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

export function AttachmentUpload({ cardPublicId }: { cardPublicId: string }) {
  const { openModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadOne = async (file: File) => {
    const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
    const response = await fetch(
      `${baseUrl}/api/upload/attachment?cardPublicId=${encodeURIComponent(cardPublicId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-original-filename": encodeURIComponent(file.name),
        },
        body: file,
      },
    );

    if (!response.ok) {
      throw new Error("Upload failed");
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress({ current: 0, total: files.length });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      setProgress({ current: i + 1, total: files.length });
      try {
        await uploadOne(file);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }

    await invalidateCard(utils, cardPublicId);

    setUploading(false);
    setProgress({ current: 0, total: 0 });

    if (failed === 0) {
      showPopup({
        header: t`Attachment uploaded`,
        message:
          succeeded === 1
            ? t`Your file has been uploaded successfully.`
            : t`${succeeded} files have been uploaded successfully.`,
        icon: "success",
      });
    } else if (succeeded === 0) {
      showPopup({
        header: t`Upload failed`,
        message: t`Failed to upload attachment. Please try again.`,
        icon: "error",
      });
    } else {
      showPopup({
        header: t`Some attachments failed`,
        message: t`${succeeded} uploaded, ${failed} failed. Please try again.`,
        icon: "error",
      });
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);

    // Reset input so selecting the same files again re-triggers change
    event.target.value = "";

    await uploadFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  return (
    <div className="mb-6">
      <input
        ref={inputRef}
        type="file"
        multiple
        id="attachment-upload"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={twMerge(
          "rounded-lg border-2 border-dashed transition-colors",
          isDragging
            ? "border-light-300 bg-light-100 dark:border-dark-300 dark:bg-dark-100"
            : "border-transparent",
        )}
      >
        <div className="flex items-center justify-between p-2">
          <Button
            type="button"
            variant="ghost"
            iconLeft={
              <HiCheckBadge className="h-4 w-4 text-light-950 dark:text-dark-950" />
            }
            iconOnly
            size="sm"
            onClick={() => openModal("ADD_CHECKLIST")}
          />
          <div className="flex items-center gap-2">
            {uploading && progress.total > 1 && (
              <span className="text-xs text-light-900 dark:text-dark-900">
                {progress.current}/{progress.total}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              iconLeft={
                <HiOutlinePaperClip className="h-4 w-4 text-light-950 dark:text-dark-950" />
              }
              isLoading={uploading}
              disabled={uploading}
              iconOnly
              size="sm"
              onClick={() => inputRef.current?.click()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
