export function Brand({ subtitle = "Staff system config" }: { subtitle?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">W</span>
      <span>
        <strong>Westbridge</strong>
        <small>{subtitle}</small>
      </span>
    </div>
  );
}
