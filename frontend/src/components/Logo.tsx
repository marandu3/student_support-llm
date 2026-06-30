import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { UDSM_LOGO_URL } from "../constants/app";

type LogoProps = {
  size?: number;
  className?: string;
};

/**
 * The official UDSM logo, with a graceful fallback to an inline mark when the
 * remote image can't load (e.g. offline / blocked network).
 */
export function Logo({ size = 40, className = "" }: LogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl brand-gradient text-white ${className}`}
        style={{ width: size, height: size }}
      >
        <GraduationCap size={Math.round(size * 0.58)} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={UDSM_LOGO_URL}
      alt="University of Dar es Salaam logo"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
