// Protected layout — all children require a valid session.
// The session check happens client-side via useSession() in each page
// (useSession redirects to /login on a 401). Server-side we cannot check
// the httpOnly cookie without a custom Next.js middleware, so this layout
// is intentionally thin — it is the useSession hook in each page that
// enforces auth.
export default function ProtectedLayout({ children }) {
  return children;
}
