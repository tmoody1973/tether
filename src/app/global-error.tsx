"use client";

import ErrorPage from "./error";

/** Final review I5: replaces the root layout when it throws, so it brings its own html and body. */
export default function GlobalError(props: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
