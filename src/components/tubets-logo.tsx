import Image from "next/image";
import { cn } from "@/lib/cn";

export function TubetsLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/tubets-logo.png"
      alt=""
      width={32}
      height={32}
      className={cn(
        "h-8 w-8 shrink-0 rounded-full object-contain [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.8))]",
        className
      )}
    />
  );
}
