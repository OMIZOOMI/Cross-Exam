import Link from "next/link";
import { Brand } from "../components/ui";

export default function NotFound() {
  return (
    <main id="main" className="empty-page">
      <Brand />
      <span className="eyebrow">404 / OUTSIDE THE RECORD</span>
      <h1>This case file isn’t here.</h1>
      <p>Return to the workspace or explore the example investigation.</p>
      <Link className="button button-primary" href="/report/demo">
        Open demo report
      </Link>
      <Link className="text-link" href="/">
        Back to home
      </Link>
    </main>
  );
}
