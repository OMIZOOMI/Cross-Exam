import Link from "next/link";
import { Brand } from "../components/ui";

export default function NotFound() {
  return (
    <main id="main" className="empty-page">
      <Brand />
      <h1>This page couldn’t be found.</h1>
      <p>If you opened a report link, it may have expired. Reports are kept for up to 24 hours.</p>
      <Link className="button button-primary" href="/#scan">
        Start a new scan
      </Link>
      <Link className="text-link" href="/report/demo">
        Open demo report
      </Link>
    </main>
  );
}
