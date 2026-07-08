"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { TagList } from "@/components/tag-list";
import {
  IconPlus,
  IconX,
  IconTrash,
  IconPin,
  IconPencil,
  IconBell,
  IconLink,
  IconFile,
  IconText,
  IconDownload,
  IconArrowUp,
  IconUsers,
} from "@/components/icons";
import {
  BOARD_TITLE_MAX,
  BOARD_DESC_MAX,
  CONTRIBUTION_TITLE_MAX,
  CONTRIBUTION_BODY_MAX,
  CHAT_TITLE_MAX,
  type ContributionKind,
} from "@/lib/resources-label";
import { UpvoteButton } from "../upvote-button";
import { ContributionMarkdown } from "../markdown";
import { Linkify } from "@/lib/linkify";
import {
  createContributionAction,
  deleteContributionAction,
  updateContributionAction,
  setContributionPinnedAction,
  deleteBoardAction,
  updateBoardAction,
  toggleBoardUpvoteAction,
  toggleContributionUpvoteAction,
  toggleBoardFollowAction,
  addBoardChatAction,
  updateBoardChatAction,
  deleteBoardChatAction,
  reorderBoardChatsAction,
} from "../actions";

export type BoardHeader = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  pinned: boolean;
  upvotes: number;
  viewerUpvoted: boolean;
  contributionCount: number;
  createdAt: string;
  authorName: string;
  isStudent: boolean;
  isMine: boolean;
  following: boolean;
};

export type ChatLink = {
  id: string;
  title: string;
  url: string;
  submittedByName: string;
  // Whether the current viewer submitted this chat (non-owners may delete their
  // own submission; owners/admins can manage every chat regardless).
  isMine: boolean;
};

export type ContributionCard = {
  id: string;
  kind: ContributionKind;
  title: string;
  url: string | null;
  filePath: string | null;
  fileName: string | null;
  body: string | null;
  pinned: boolean;
  upvotes: number;
  viewerUpvoted: boolean;
  createdAt: string;
  authorName: string;
  isStudent: boolean;
  isMine: boolean;
};

const controlCls =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function BoardDetailClient({
  header,
  contributions,
  chats,
  canManageChats,
}: {
  header: BoardHeader;
  contributions: ContributionCard[];
  chats: ChatLink[];
  // True when the viewer owns the board OR is a site admin (admins are treated
  // as board owners) — gates the edit / reorder / delete-any chat controls.
  canManageChats: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [showForm, setShowForm] = useState(false);
  const [editingBoard, setEditingBoard] = useState(false);
  const [following, setFollowing] = useState(header.following);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followPending, startFollow] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const toggleFollow = () => {
    const prev = following;
    setFollowError(null);
    setFollowing(!prev);
    startFollow(async () => {
      try {
        const res = await toggleBoardFollowAction({ boardId: header.id });
        if (res.ok) setFollowing(res.following);
        else {
          // Roll back the optimistic flip AND tell the user why — otherwise the
          // button just snaps back with no explanation (mirrors the inline error
          // pattern used for contribution/board mutations).
          setFollowing(prev);
          setFollowError(res.error);
        }
      } catch {
        setFollowing(prev);
        setFollowError("Couldn't update follow. Please try again.");
      }
    });
  };

  const removeBoard = () => {
    if (!confirm("Delete this board and all its contributions? This can't be undone.")) return;
    startDelete(async () => {
      const res = await deleteBoardAction({ id: header.id });
      if (res.ok) {
        router.push("/resources");
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Board header — or its inline edit form (owner only) */}
      {editingBoard ? (
        <BoardEditForm
          header={header}
          onCancel={() => setEditingBoard(false)}
          onDone={() => {
            setEditingBoard(false);
            router.refresh();
          }}
        />
      ) : (
      <header className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {header.pinned && (
              <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                <IconPin className="h-3 w-3" />
                Pinned
              </span>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-white">{header.title}</h1>
            {header.description && (
              <p className="mt-2 whitespace-pre-line text-sm text-white/65">
                <Linkify>{header.description}</Linkify>
              </p>
            )}
          </div>
          <div className="shrink-0">
            <UpvoteButton
              initialCount={header.upvotes}
              initialUpvoted={header.viewerUpvoted}
              onToggle={() => toggleBoardUpvoteAction({ boardId: header.id })}
              label="board upvote"
            />
          </div>
        </div>

        {header.tags.length > 0 && (
          <div className="mt-3">
            <TagList tags={header.tags} max={6} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/40">
          <span>
            Started by <span className="text-white/60">{header.authorName}</span>
            {header.isStudent && " (student)"} · {relativeDate(header.createdAt)}
          </span>
          <span aria-hidden>·</span>
          <span>
            {header.contributionCount} {header.contributionCount === 1 ? "contribution" : "contributions"}
          </span>
          <span className="ml-auto inline-flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followPending}
              aria-pressed={following}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                following
                  ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                  : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white/90"
              }`}
              title={following ? "You'll be notified of new contributions" : "Get notified of new contributions"}
            >
              <IconBell className="h-3.5 w-3.5" />
              {following ? "Following" : "Follow"}
            </button>
            {header.isMine && (
              <>
                <button
                  type="button"
                  onClick={() => setEditingBoard(true)}
                  aria-label="Edit this board"
                  title="Edit this board"
                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-amber-200"
                >
                  <IconPencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={removeBoard}
                  disabled={deletePending}
                  aria-label="Delete this board"
                  title="Delete this board"
                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </>
            )}
          </span>
        </div>

        {followError && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {followError}
          </p>
        )}
      </header>
      )}

      {/* Group chats — external join links (WhatsApp, Pronto, any URL) */}
      <GroupChatsSection
        boardId={header.id}
        chats={chats}
        canManage={canManageChats}
        onChanged={() => router.refresh()}
      />

      {/* Add-a-contribution toggle */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white/80">Contributions</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          {showForm ? <IconX className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
          {showForm ? "Close" : "Add a contribution"}
        </button>
      </div>

      {showForm && (
        <ContributionForm
          boardId={header.id}
          onDone={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}

      {/* Contributions thread (sorted server-side by upvotes desc) */}
      {contributions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-white/60">No contributions yet — be the first to add one.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {contributions.map((c, i) => (
            <ContributionItem
              key={c.id}
              contribution={c}
              index={i}
              reduce={Boolean(reduce)}
              viewerIsOwner={header.isMine}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: ContributionKind }) {
  if (kind === "file") return <IconFile className="h-4 w-4" />;
  if (kind === "text") return <IconText className="h-4 w-4" />;
  return <IconLink className="h-4 w-4" />;
}

function ContributionItem({
  contribution: c,
  index,
  reduce,
  viewerIsOwner,
  onChanged,
}: {
  contribution: ContributionCard;
  index: number;
  reduce: boolean;
  viewerIsOwner: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [pinPending, startPin] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (!confirm("Remove this contribution?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteContributionAction({ id: c.id });
      if (res.ok) onChanged();
      else setError(res.error);
    });
  };

  const togglePin = () => {
    setError(null);
    startPin(async () => {
      const res = await setContributionPinnedAction({ contributionId: c.id, pinned: !c.pinned });
      if (res.ok) onChanged();
      else setError(res.error);
    });
  };

  if (editing) {
    return (
      <li className="rounded-2xl border border-amber-400/30 bg-white/[0.02] p-4">
        <ContributionEditForm
          contribution={c}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: reduce ? 0 : Math.min(index * 0.025, 0.18) }}
      className={`flex gap-3 rounded-2xl border bg-white/[0.02] p-4 transition-colors hover:border-white/20 ${
        c.pinned ? "border-amber-400/30" : "border-white/10"
      }`}
    >
      {/* Vote rail (Reddit-style) */}
      <div className="shrink-0 pt-0.5">
        <UpvoteButton
          initialCount={c.upvotes}
          initialUpvoted={c.viewerUpvoted}
          onToggle={() => toggleContributionUpvoteAction({ contributionId: c.id })}
          size="sm"
          label="contribution upvote"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50">
                <KindIcon kind={c.kind} />
                {c.kind}
              </span>
              {c.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  <IconPin className="h-3 w-3" />
                  Pinned
                </span>
              )}
            </div>

            {c.kind === "link" && c.url ? (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 block text-base font-semibold text-white hover:text-amber-200"
              >
                {c.title}
                <span className="ml-2 truncate text-xs font-normal text-white/40">
                  {hostOf(c.url)}
                </span>
              </a>
            ) : (
              <h3 className="mt-1 text-base font-semibold text-white">{c.title}</h3>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {/* Pin toggle — board owner only */}
            {viewerIsOwner && (
              <button
                type="button"
                onClick={togglePin}
                disabled={pinPending}
                aria-pressed={c.pinned}
                aria-label={c.pinned ? "Unpin this contribution" : "Pin this contribution"}
                title={c.pinned ? "Unpin this contribution" : "Pin to the top"}
                className={`rounded-md p-1.5 transition-colors hover:bg-white/5 disabled:opacity-50 ${
                  c.pinned ? "text-amber-300 hover:text-amber-200" : "text-white/40 hover:text-amber-200"
                }`}
              >
                <IconPin className="h-4 w-4" />
              </button>
            )}
            {/* Edit + delete — author only */}
            {c.isMine && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit this contribution"
                  title="Edit this contribution"
                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-amber-200"
                >
                  <IconPencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  aria-label="Remove this contribution"
                  title="Remove this contribution"
                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* File download affordance */}
        {c.kind === "file" && c.filePath && (
          <a
            href={c.filePath}
            target="_blank"
            rel="noopener noreferrer nofollow"
            download={c.fileName ?? undefined}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:border-amber-400/40 hover:text-amber-200"
          >
            <IconDownload className="h-3.5 w-3.5" />
            {c.fileName ?? "Download file"}
          </a>
        )}

        {/* Text body (markdown, safely rendered) */}
        {c.kind === "text" && c.body && (
          <div className="mt-2">
            <ContributionMarkdown content={c.body} />
          </div>
        )}

        <p className="mt-3 text-xs text-white/40">
          {c.authorName}
          {c.isStudent && " (student)"} · {relativeDate(c.createdAt)}
        </p>

        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>
    </motion.li>
  );
}

const KINDS: Array<{ key: ContributionKind; label: string; Icon: typeof IconLink }> = [
  { key: "link", label: "Link", Icon: IconLink },
  { key: "file", label: "File", Icon: IconFile },
  { key: "text", label: "Text", Icon: IconText },
];

// The "Add a contribution" form: pick a kind (link / file / text), fill the
// relevant fields. For "file" we upload via the existing /api/blob/upload route
// (reused as-is) and submit the returned path. The server re-validates everything.
function ContributionForm({ boardId, onDone }: { boardId: string; onDone: () => void }) {
  const [kind, setKind] = useState<ContributionKind>("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Board file contributions accept PDFs/docs + images (server allow-lists
      // the type and stores them publicly so members can download).
      fd.append("purpose", "board-file");
      const res = await fetch("/api/blob/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error === "unsupported file type"
            ? "That file type isn't supported. Try a PDF, document, or image."
            : data?.error === "file too large"
              ? "That file is too large (20 MB max)."
              : "Upload failed. Please try again.",
        );
        setFilePath(null);
        setFileName(null);
        return;
      }
      const data = (await res.json()) as { url: string; pathname?: string };
      setFilePath(data.url);
      setFileName(file.name);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await createContributionAction({
          boardId,
          kind,
          title,
          url: kind === "link" ? url : undefined,
          filePath: kind === "file" ? filePath ?? undefined : undefined,
          fileName: kind === "file" ? fileName ?? undefined : undefined,
          body: kind === "text" ? body : undefined,
        });
        if (res.ok) {
          setTitle("");
          setUrl("");
          setBody("");
          setFilePath(null);
          setFileName(null);
          onDone();
        } else {
          setError(res.error);
        }
      } catch {
        // A thrown action must not crash to the error boundary — the
        // contribution may have been saved. Show a recoverable notice.
        setError(
          "Your connection dropped before we could confirm. Reload the page to see the latest, then resubmit if it is not there.",
        );
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      {/* Kind selector */}
      <div className="flex items-center gap-2">
        {KINDS.map(({ key, label, Icon }) => {
          const active = kind === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setKind(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                  : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/80"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CONTRIBUTION_TITLE_MAX}
          placeholder={kind === "text" ? "What is this about?" : "A short, descriptive title"}
          className={controlCls}
        />
      </label>

      {kind === "link" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">Link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://…"
            className={controlCls}
          />
        </label>
      )}

      {kind === "file" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">File</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
            className="block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/15"
          />
          {!uploading && !filePath && (
            <p className="text-xs text-white/45">PDFs, documents, or images — up to 20 MB.</p>
          )}
          {uploading && <p className="text-xs text-white/50">Uploading…</p>}
          {filePath && !uploading && (
            <p className="text-xs text-amber-200">Attached: {fileName}</p>
          )}
        </div>
      )}

      {kind === "text" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">
            Text <span className="font-normal text-white/45">(markdown supported)</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={CONTRIBUTION_BODY_MAX}
            rows={6}
            placeholder="Write a note, a how-to, a summary… **bold**, _italic_, lists, and links all work."
            className={controlCls}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading || (kind === "file" && !filePath)}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add contribution"}
        </button>
        <span className="text-xs text-white/40">Contributions are attributed and permanent.</span>
      </div>
    </form>
  );
}

// Inline board edit form (owner only). Prefilled with the board's current
// title/description/tags; tags are a comma-separated free-text field. Mirrors the
// create-board form styling. The server re-validates + re-scopes to the owner.
function BoardEditForm({
  header,
  onCancel,
  onDone,
}: {
  header: BoardHeader;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(header.title);
  const [description, setDescription] = useState(header.description ?? "");
  const [tags, setTags] = useState(header.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    startTransition(async () => {
      try {
        const res = await updateBoardAction({
          boardId: header.id,
          title,
          description,
          tags: tagList,
        });
        if (res.ok) onDone();
        else setError(res.error);
      } catch {
        setError("Your connection dropped before we could confirm. Reload the page to see the latest, then resave if your change is not there.");
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-amber-400/30 bg-white/[0.02] p-5"
    >
      <h2 className="text-sm font-semibold text-white/80">Edit board</h2>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BOARD_TITLE_MAX}
          placeholder="What's this board about?"
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Description <span className="font-normal text-white/45">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={BOARD_DESC_MAX}
          rows={4}
          placeholder="Give members context on what belongs here."
          className={controlCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">
          Tags <span className="font-normal text-white/45">(optional, comma-separated)</span>
        </span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="math, college-prep, video"
          className={controlCls}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:text-white/90 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Inline contribution edit form (author only). The kind is FIXED — we edit the
// title (always) plus the one kind-relevant field (link → url, text → body;
// file → title only, uploads are not re-handled). Markdown body keeps the same
// affordance as create. The server re-validates + re-scopes to the author.
function ContributionEditForm({
  contribution: c,
  onCancel,
  onDone,
}: {
  contribution: ContributionCard;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(c.title);
  const [url, setUrl] = useState(c.url ?? "");
  const [body, setBody] = useState(c.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateContributionAction({
          id: c.id,
          kind: c.kind,
          title,
          url: c.kind === "link" ? url : undefined,
          body: c.kind === "text" ? body : undefined,
        });
        if (res.ok) onDone();
        else setError(res.error);
      } catch {
        setError("Your connection dropped before we could confirm. Reload the page to see the latest, then resave if your change is not there.");
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50">
          <KindIcon kind={c.kind} />
          {c.kind}
        </span>
        <span className="text-xs text-white/40">Editing — the type can&apos;t be changed.</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CONTRIBUTION_TITLE_MAX}
          className={controlCls}
        />
      </label>

      {c.kind === "link" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">Link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://…"
            className={controlCls}
          />
        </label>
      )}

      {c.kind === "file" && (
        <p className="text-xs text-white/45">
          The attached file{c.fileName ? ` (${c.fileName})` : ""} stays as-is — only the title is
          editable.
        </p>
      )}

      {c.kind === "text" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/80">
            Text <span className="font-normal text-white/45">(markdown supported)</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={CONTRIBUTION_BODY_MAX}
            rows={6}
            className={controlCls}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:text-white/90 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Group chats section
//
// Lists a board's external group-chat join links. ANY verified member can submit
// one (title + http(s) URL). The board owner / site admin (`canManage`) can edit,
// reorder, and delete ANY chat; a non-owner can delete only their OWN submission.
// The server re-validates + re-authorizes every action.
// ---------------------------------------------------------------------------
function GroupChatsSection({
  boardId,
  chats,
  canManage,
  onChanged,
}: {
  boardId: string;
  chats: ChatLink[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reorderPending, startReorder] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Move a chat up/down by one and persist the whole new order. Owner/admin only
  // (the buttons are gated on canManage; the server re-checks). We compute the
  // new id order client-side and send it; the action validates it's the same set.
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= chats.length) return;
    const ids = chats.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setError(null);
    startReorder(async () => {
      const res = await reorderBoardChatsAction({ boardId, orderedIds: ids });
      if (res.ok) onChanged();
      else setError(res.error);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white/80">
          <IconUsers className="h-4 w-4 text-white/50" />
          Group chats
        </h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:text-white/90"
        >
          {showForm ? <IconX className="h-3.5 w-3.5" /> : <IconPlus className="h-3.5 w-3.5" />}
          {showForm ? "Close" : "Add a group chat"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4">
          <ChatSubmitForm
            boardId={boardId}
            onDone={() => {
              setShowForm(false);
              onChanged();
            }}
          />
        </div>
      )}

      {chats.length === 0 ? (
        <p className="mt-4 text-sm text-white/50">
          No group chats linked yet — add a WhatsApp, Pronto, or other invite link so members can join
          the conversation.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {chats.map((chat, i) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              index={i}
              total={chats.length}
              canManage={canManage}
              reorderPending={reorderPending}
              onMove={move}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ChatRow({
  chat,
  index,
  total,
  canManage,
  reorderPending,
  onMove,
  onChanged,
}: {
  chat: ChatLink;
  index: number;
  total: number;
  canManage: boolean;
  reorderPending: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Owner/admin can delete any chat; a non-owner can delete only their own.
  const canDelete = canManage || chat.isMine;

  const remove = () => {
    if (!confirm("Remove this group chat link?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBoardChatAction({ id: chat.id });
      if (res.ok) onChanged();
      else setError(res.error);
    });
  };

  if (editing) {
    return (
      <li className="rounded-xl border border-amber-400/30 bg-white/[0.02] p-4">
        <ChatEditForm
          chat={chat}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/20">
      {/* Reorder controls — owner/admin only */}
      {canManage && total > 1 && (
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={reorderPending || index === 0}
            aria-label="Move up"
            title="Move up"
            className="rounded p-0.5 text-white/40 transition-colors hover:text-amber-200 disabled:opacity-30"
          >
            <IconArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={reorderPending || index === total - 1}
            aria-label="Move down"
            title="Move down"
            className="rounded p-0.5 text-white/40 transition-colors hover:text-amber-200 disabled:opacity-30"
          >
            <IconArrowUp className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <a
          href={chat.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold text-white hover:text-amber-200"
        >
          {chat.title}
          <span className="ml-2 text-xs font-normal text-white/40">{hostOf(chat.url)}</span>
        </a>
        <p className="mt-0.5 truncate text-xs text-white/40">Added by {chat.submittedByName}</p>
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Edit — owner/admin only (may edit any chat) */}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit this group chat"
            title="Edit this group chat"
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-amber-200"
          >
            <IconPencil className="h-4 w-4" />
          </button>
        )}
        {/* Delete — owner/admin (any) or submitter (own) */}
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Remove this group chat"
            title="Remove this group chat"
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function ChatSubmitForm({ boardId, onDone }: { boardId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await addBoardChatAction({ boardId, title, url });
        if (res.ok) {
          setTitle("");
          setUrl("");
          onDone();
        } else {
          setError(res.error);
        }
      } catch {
        setError(
          "Your connection dropped before we could confirm. Reload the page to see the latest, then resubmit if it is not there.",
        );
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CHAT_TITLE_MAX}
          placeholder="e.g. AP Calc BC — WhatsApp"
          className={controlCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Invite link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://…"
          className={controlCls}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add group chat"}
        </button>
        <span className="text-xs text-white/40">
          Anyone verified can add one; it&apos;s attributed to you.
        </span>
      </div>
    </form>
  );
}

function ChatEditForm({
  chat,
  onCancel,
  onDone,
}: {
  chat: ChatLink;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(chat.title);
  const [url, setUrl] = useState(chat.url);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateBoardChatAction({ id: chat.id, title, url });
        if (res.ok) onDone();
        else setError(res.error);
      } catch {
        setError(
          "Your connection dropped before we could confirm. Reload the page to see the latest, then resave if your change is not there.",
        );
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={CHAT_TITLE_MAX}
          className={controlCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white/80">Invite link</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="https://…"
          className={controlCls}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white/70 transition hover:text-white/90 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
