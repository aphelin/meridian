"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell pt-10 md:pt-16">
      <div className="panel grid place-items-center px-6 py-20 text-center">
        <h1 className="title">Something went wrong</h1>
        <p className="mt-3 max-w-[46ch] text-stone">
          A service behind this page didn’t answer. It’s usually temporary, so try again in a moment.
        </p>
        {error.digest ? <p className="mt-3 text-sm text-stone tabular">Reference: {error.digest}</p> : null}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
