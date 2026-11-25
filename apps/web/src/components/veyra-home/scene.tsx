"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { mountVeyraScene } from "./motion";

export function VeyraHomeScene({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (root.current) return mountVeyraScene(root.current);
  }, []);

  return (
    <div className="veyra-home" ref={root}>
      {children}
    </div>
  );
}
