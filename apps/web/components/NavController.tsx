"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Closes the mobile navigation drawer after navigation or Escape. */
export default function NavController() {
  const pathname = usePathname();

  useEffect(() => {
    const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
      if (toggle) toggle.checked = false;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
