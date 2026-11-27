"use client";

import React, { useEffect, useState } from "react";

export interface StaffAvatarProps {
  name?: string | null;
  pictureUrl?: string | null;
  fallback?: string;
  size?: "sm" | "md";
}

/** Renders a linked Google profile avatar with an initial-letter fallback. */
export const StaffAvatar: React.FC<StaffAvatarProps> = ({
  name,
  pictureUrl,
  fallback = "U",
  size = "sm",
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [pictureUrl]);

  const initial = name?.trim().charAt(0).toUpperCase() || fallback;
  const sizeClass = size === "md" ? "h-7 w-7 text-xs" : "h-6 w-6 text-[11px]";

  return (
    <div
      className={`${sizeClass} rounded-full bg-canvas-soft border border-hairline text-ink-secondary flex items-center justify-center font-medium shrink-0 overflow-hidden`}
    >
      {pictureUrl && !imgFailed ? (
        <img
          src={pictureUrl}
          alt={name ? `${name} avatar` : "Staff avatar"}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="select-none">{initial}</span>
      )}
    </div>
  );
};
