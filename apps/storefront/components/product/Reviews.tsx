"use client";

import Link from "next/link";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { RatingSummaryDto, ReviewDto } from "@meridian/contracts";
import { FieldError } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { plural, shortDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { QueryError, referenceOf } from "../shop/states";

const STAR = "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z";

function StarShape({ fill, size }: { fill: number; size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={STAR} fill="currentColor" clipPath={`url(#${id})`} />
    </svg>
  );
}

/** Five ink stars filled to `rating` (0–5). */
export function Stars({ rating, size = 16, label = true }: { rating: number; size?: number; label?: boolean }) {
  const rounded = Math.round(rating * 10) / 10;
  return (
    <span className="inline-flex items-center gap-0.5 text-ink" role={label ? "img" : undefined} aria-label={label ? `Rated ${rounded} out of 5` : undefined}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarShape key={i} size={size} fill={Math.min(1, Math.max(0, rating - i))} />
      ))}
    </span>
  );
}

function Summary({ summary }: { summary: RatingSummaryDto }) {
  if (!summary.count || summary.average === null) return null;
  const top = Math.max(...summary.distribution, 1);
  return (
    <div>
      <div className="flex items-center gap-4">
        <p className="text-5xl leading-none tracking-[-0.03em] tabular">{summary.average.toFixed(1)}</p>
        <div className="flex flex-col gap-1">
          <Stars rating={summary.average} size={18} />
          <p className="text-sm leading-none text-stone">Based on {plural(summary.count, "review")}</p>
        </div>
      </div>
      <dl className="mt-5 grid gap-1.5">
        {[4, 3, 2, 1, 0].map((i) => (
          <div key={i} className="grid grid-cols-[3.25rem_1fr_2rem] items-center gap-3 text-sm">
            <dt className="text-stone tabular">{i + 1} star</dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-plaster" aria-hidden="true">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${(summary.distribution[i] / top) * 100}%` }} />
            </dd>
            <dd className="text-right tabular text-stone">{summary.distribution[i]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReviewItem({ review }: { review: ReviewDto }) {
  return (
    <li className="border-b border-line py-6 first:pt-0">
      <Stars rating={review.rating} />
      <h3 className="mt-2 font-medium">{review.title}</h3>
      <p className="mt-1.5 whitespace-pre-line text-ink/85">{review.body}</p>
      <p className="mt-3 text-[0.8125rem] text-stone">
        {review.authorName} · Verified purchase · <time dateTime={review.createdAt}>{shortDate(review.createdAt)}</time>
      </p>
    </li>
  );
}

function ReviewForm({ slug, name }: { slug: string; name: string }) {
  const id = useId();
  const utils = trpc.useUtils();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const post = trpc.reviews.post.useMutation({
    onSuccess: async () => {
      toast("Thanks, your review is live", { description: `It now shows on ${name}.` });
      await Promise.all([utils.reviews.list.invalidate({ slug }), utils.reviews.eligibility.invalidate({ slug })]);
    },
  });

  const errors = {
    rating: rating < 1 ? "Choose a rating from 1 to 5 stars." : null,
    title: !title.trim() ? "Give your review a title." : title.trim().length > 120 ? "Keep the title under 120 characters." : null,
    body: body.trim().length < 20 ? "Reviews need at least 20 characters." : body.trim().length > 2000 ? "Keep the review under 2,000 characters." : null,
  };
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);

  return (
    <form
      className="mt-6"
      aria-label="Write a review"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (errors.rating || errors.title || errors.body) focusFirstInvalid(e.currentTarget);
        if (errors.rating || errors.title || errors.body || post.isPending) return;
        post.mutate({ slug, rating, title: title.trim(), body: body.trim() });
      }}
    >
      <p id={`${id}-title`} className="heading">
        Write a review
      </p>
      <p className="mt-1 text-sm text-stone">Your order was delivered, so your review shows as a verified purchase.</p>

      <p id={`${id}-rating`} className="label mt-5">
        Rating
      </p>
      <RadioGroupPrimitive.Root
        className="mt-1.5 flex gap-1"
        aria-labelledby={`${id}-rating`}
        aria-describedby={show("rating") ? `${id}-rating-error` : undefined}
        value={rating ? String(rating) : ""}
        onValueChange={(v) => setRating(Number(v))}
        orientation="horizontal"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <RadioGroupPrimitive.Item
            key={n}
            value={String(n)}
            aria-label={plural(n, "star")}
            aria-invalid={Boolean(show("rating")) || undefined}
            className={`grid size-11 place-items-center rounded-full transition-[background-color,transform] duration-200 hover:bg-plaster active:scale-90 ${n <= rating ? "text-ink" : "text-line-strong"}`}
          >
            <StarShape size={28} fill={n <= rating ? 1 : 0} />
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <FieldError id={`${id}-rating-error`}>{show("rating")}</FieldError>

      <label htmlFor={`${id}-review-title`} className="label mt-5 block">
        Title
      </label>
      <input
        id={`${id}-review-title`}
        className="field mt-1.5"
        maxLength={120}
        value={title}
        aria-invalid={Boolean(show("title")) || undefined}
        aria-describedby={show("title") ? `${id}-review-title-error` : undefined}
        onChange={(e) => setTitle(e.target.value)}
      />
      <FieldError id={`${id}-review-title-error`}>{show("title")}</FieldError>

      <label htmlFor={`${id}-review-body`} className="label mt-5 block">
        Review
      </label>
      <textarea
        id={`${id}-review-body`}
        className="field mt-1.5 min-h-32 resize-y py-3"
        maxLength={2000}
        rows={5}
        value={body}
        aria-invalid={Boolean(show("body")) || undefined}
        aria-describedby={show("body") ? `${id}-review-body-error ${id}-review-count` : `${id}-review-count`}
        onChange={(e) => setBody(e.target.value)}
      />
      <FieldError id={`${id}-review-body-error`}>{show("body")}</FieldError>
      <p id={`${id}-review-count`} className="hint flex justify-between tabular">
        <span>How does it look, feel and hold up?</span>
        <span>{body.trim().length} / 2000</span>
      </p>

      {post.error ? (
        <div className="alert alert-error mt-4" role="alert">
          <span>
            {post.error.message}
            {referenceOf(post.error) ? <span className="mt-1 block text-xs tabular break-all">{referenceOf(post.error)}</span> : null}
          </span>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary mt-5" disabled={post.isPending}>
        {post.isPending ? (
          <>
            <span className="spinner" aria-hidden="true" /> Posting
          </>
        ) : (
          "Post review"
        )}
      </button>
    </form>
  );
}

function Eligibility({ slug, name }: { slug: string; name: string }) {
  const query = trpc.reviews.eligibility.useQuery({ slug });
  if (query.isPending) return <Skeleton className="mt-6 h-12 w-full" />;
  if (query.isError) return <p className="mt-6 text-sm text-stone">We couldn’t check whether you can review this piece right now.</p>;
  const { reason } = query.data;
  if (reason === "eligible") return <ReviewForm slug={slug} name={name} />;
  return (
    <p className="mt-6 rounded-[14px] bg-plaster px-4 py-3 text-sm text-stone" role="note">
      {reason === "sign-in" ? (
        <>
          Bought this piece?{" "}
          <Link href="/account" className="link text-ink">
            Sign in to review it
          </Link>
          .
        </>
      ) : reason === "not-delivered" ? (
        "You can review this piece once your order of it has been delivered."
      ) : (
        "Thanks, you’ve already reviewed this piece."
      )}
    </p>
  );
}

/** Reviews: rating summary, verified-purchase reviews with cursor paging, and the review form for eligible shoppers. */
export function Reviews({ slug, name }: { slug: string; name: string }) {
  const list = trpc.reviews.list.useInfiniteQuery({ slug }, { getNextPageParam: (last) => last.nextCursor ?? undefined });
  const first = list.data?.pages[0];
  const reviews = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section id="reviews" className="mt-16 scroll-mt-28 border-line lg:mt-32 lg:border-t lg:pt-12" aria-labelledby="reviews-title">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5 xl:col-span-4">
          <h2 id="reviews-title" className="section-title">
            Reviews
          </h2>
          <div className="mt-6">
            {list.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : first?.summary.count ? (
              <Summary summary={first.summary} />
            ) : list.isError ? null : (
              <p className="text-stone">Only shoppers whose order of this piece was delivered can review it.</p>
            )}
          </div>
          <Eligibility slug={slug} name={name} />
        </div>
        <div className="lg:col-span-7 xl:col-span-8">
          {list.isPending ? (
            <div className="grid gap-6" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-5 w-1/2" />
                  <Skeleton className="mt-2 h-16 w-full" />
                </div>
              ))}
            </div>
          ) : list.isError && !reviews.length ? (
            <QueryError title="We couldn’t load reviews." error={list.error} onRetry={() => void list.refetch()} />
          ) : reviews.length ? (
            <>
              <ul aria-label={`Reviews of ${name}`}>
                {reviews.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
              {list.isFetchNextPageError ? <QueryError className="mt-6" title="We couldn’t load more reviews." error={list.error} onRetry={() => void list.fetchNextPage()} /> : null}
              {list.hasNextPage ? (
                <button type="button" className="btn btn-secondary mt-6" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                  {list.isFetchingNextPage ? "Loading" : "Show more reviews"}
                </button>
              ) : null}
            </>
          ) : (
            <div className="panel px-6 py-12 text-center">
              <p className="heading">Be the first to review {name}</p>
              <p className="mx-auto mt-2 max-w-[44ch] text-stone">No reviews yet. Every review here comes from a verified purchase.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
