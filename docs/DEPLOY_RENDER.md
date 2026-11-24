# Deploy Veyra on Render

Use one Node web service from the repository root. The Blueprint in
[`render.yaml`](../render.yaml) sets the Free plan, Node 24, the frozen pnpm build,
the public start command, and temporary report storage.

1. Publish a reviewed GitHub branch containing the working app and `render.yaml`.
2. In [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**,
   connect the GitHub repository, and select that branch.
3. Enter the service’s exact HTTPS address as `VEYRA_PUBLIC_ORIGIN`, for example
   `https://veyra.onrender.com`, with no trailing slash or path. If Render has not
   assigned the address yet, use `https://veyra.invalid` during setup.
4. Apply the Blueprint. Copy the actual URL from the web service page. If it differs
   from the origin you entered, update `VEYRA_PUBLIC_ORIGIN` in the service’s
   **Environment** tab and save and deploy.
5. Open the assigned URL and submit one public website you own. Confirm Veyra opens
   a live report, then share the service URL.

[Render Blueprints](https://render.com/docs/infrastructure-as-code) · [Render Web Services](https://render.com/docs/web-services)

Keep the service at one instance. It runs one scan at a time and accepts six starts
per minute across visitors. Each scan is limited to eight pages and 45 seconds, inside
the route’s 60-second ceiling. The existing scanner request policy checks destinations
and redirects. Browser execution and AI remain off.

The deployment serves a public, unauthenticated scanner. The exact origin guard blocks
cross-site browser submissions. Anyone with a report URL can read that report. Reports
are limited to the 20 most recent files and expire after 24 hours. Render restarts or
redeploys can clear the temporary directory. [Render Free limits](https://render.com/docs/free)
