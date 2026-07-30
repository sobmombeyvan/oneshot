"use client";

/**
 * Replaces the root layout when it fails, so it cannot rely on the app's CSS
 * being loaded. Everything here is inline styled on purpose: a blank screen
 * tells the cashier nothing, and this is the last chance to say something.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#050505",
          color: "#E9E3D8",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Erreur — ONE SHOT</title>
        <div style={{ maxWidth: "480px", textAlign: "center" }}>
          <h1 style={{ color: "#C66A24", fontSize: "22px", marginBottom: "12px" }}>
            L&apos;application n&apos;a pas pu démarrer
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.5, opacity: 0.8 }}>
            Rechargez la page. Si le problème persiste, votre navigateur est
            peut-être trop ancien : mettez Google Chrome à jour, puis réessayez.
          </p>
          {error.digest && (
            <p style={{ fontSize: "12px", opacity: 0.5, marginTop: "16px" }}>
              Code : {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "24px",
              padding: "12px 24px",
              fontSize: "15px",
              color: "#050505",
              background: "#C66A24",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
