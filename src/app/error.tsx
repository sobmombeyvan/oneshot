"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-black p-6">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--font-cinzel)] text-2xl font-bold text-primary">
          Une erreur est survenue
        </h1>
        <p className="mt-3 text-sm text-off-white/70 leading-relaxed">
          {error.message || "La page n'a pas pu s'afficher."}
        </p>
        {error.digest && (
          <p className="mt-4 text-xs text-off-white/40">Code : {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 px-6 py-3 rounded-xl bg-primary text-black text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
