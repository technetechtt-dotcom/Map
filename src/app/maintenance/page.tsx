export default function MaintenancePage() {
  return (
    <div className="page max-w-lg">
      <p className="eyebrow">Service notice</p>
      <h1>Temporarily unavailable</h1>
      <p className="text-muted text-sm">
        The SA ICT Ecosystem Map is undergoing scheduled maintenance. Public pages and
        submission forms are paused. Platform administrators can still sign in.
      </p>
      <p className="mt-6 text-sm">
        <a href="/login" className="text-g700 font-semibold">
          Administrator login
        </a>
      </p>
    </div>
  );
}
