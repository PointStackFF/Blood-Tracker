export default function Home() {
  return (
    <main style={{ padding: "3rem", fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
      <h1>Blood custody tracker</h1>
      <p>
        Prototype scaffold — medic flow and blood bank dashboard UI aren&apos;t
        built yet. The event-log API is live:
      </p>
      <ul>
        <li><code>GET /api/units</code> — every unit with its derived state</li>
        <li><code>GET /api/units/:id</code> — one unit&apos;s full event history</li>
        <li><code>POST /api/consignments</code> — issue a new consignment</li>
        <li><code>POST /api/events</code> — log REM/RET/TIC_SWAP/TRANSFUSE/DISCARD/etc.</li>
      </ul>
      <p>
        Set <code>DATABASE_URL</code> in <code>.env.local</code>, then run{" "}
        <code>npm run db:migrate</code> and <code>npm run db:seed</code>.
      </p>
    </main>
  );
}
