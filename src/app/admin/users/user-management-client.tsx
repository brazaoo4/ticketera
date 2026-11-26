"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  KeyRound,
  UserX,
  UserCheck,
  Shield,
  User as UserIcon,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  createUserAction,
  toggleUserStatusAction,
  resetPasswordAction,
} from "./actions";

interface SerializedUser {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  enabled: boolean;
  createdAt: string;
  _count: {
    receipts: number;
  };
}

export function UserManagementClient({
  users,
  currentUserId,
}: {
  users: SerializedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"USER" | "ADMIN">("USER");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState<SerializedUser | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [confirmToggleUserId, setConfirmToggleUserId] = useState<string | null>(
    null
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const filteredUsers = users.filter((u) =>
    searchQuery.trim()
      ? u.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
      : true
  );

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (createUsername.trim().length < 3) {
      setFeedback({
        type: "error",
        text: "Username must be at least 3 characters.",
      });
      return;
    }
    if (createPassword.length < 8) {
      setFeedback({
        type: "error",
        text: "Password must be at least 8 characters.",
      });
      return;
    }

    setIsCreating(true);
    try {
      const fd = new FormData();
      fd.append("username", createUsername.trim());
      fd.append("password", createPassword);
      fd.append("role", createRole);
      const res = await createUserAction(fd);

      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not create account.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text: `Created account for ${createUsername.trim()}.`,
      });
      setIsCreateOpen(false);
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("USER");
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not create account right now.",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setFeedback(null);

    if (resetPasswordVal.length < 8) {
      setFeedback({
        type: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }

    setIsResetting(true);
    try {
      const res = await resetPasswordAction(resetTarget.id, resetPasswordVal);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not update password.",
        });
        return;
      }
      setFeedback({
        type: "success",
        text: `Password updated for ${resetTarget.username}.`,
      });
      setResetTarget(null);
      setResetPasswordVal("");
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not update password right now.",
      });
    } finally {
      setIsResetting(false);
    }
  }

  async function handleToggleStatus(user: SerializedUser) {
    setTogglingId(user.id);
    setFeedback(null);
    try {
      const res = await toggleUserStatusAction(user.id);
      if (!res.success) {
        setFeedback({
          type: "error",
          text: res.error || "Could not change account status.",
        });
        return;
      }
      setConfirmToggleUserId(null);
      setFeedback({
        type: "success",
        text: user.enabled
          ? `Deactivated ${user.username}.`
          : `Reactivated ${user.username}.`,
      });
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Could not change account status.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 text-[14px] ${
            feedback.type === "error"
              ? "border-[var(--negative)]/30 bg-[var(--negative-tint)] text-[var(--negative)]"
              : "border-[var(--positive)]/30 bg-[var(--positive-tint)] text-[var(--positive)]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Add CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by username..."
            className="w-full h-10 pl-10 pr-8 rounded-full bg-[var(--bg-card)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear filter"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsCreateOpen(true);
            setFeedback(null);
          }}
          className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[14px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <UserPlus className="w-4 h-4 shrink-0" />
          Add account
        </button>
      </div>

      {/* Desktop Users Table */}
      <div className="hidden md:block rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <table className="w-full text-left border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[13px] text-[var(--text-muted)]">
              <th className="py-3.5 px-5 font-medium">Account</th>
              <th className="py-3.5 px-4 font-medium">Role</th>
              <th className="py-3.5 px-4 font-medium">Status</th>
              <th className="py-3.5 px-4 font-medium text-right">Receipts</th>
              <th className="py-3.5 px-4 font-medium">Joined</th>
              <th className="py-3.5 px-5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserId;
              const confirmingToggle = confirmToggleUserId === user.id;

              return (
                <React.Fragment key={user.id}>
                  <tr className="hover:bg-[var(--bg-subtle)]/50 transition-colors">
                    <td className="py-3.5 px-5 font-semibold text-[var(--text-primary)]">
                      {user.username}
                      {isSelf && (
                        <span className="ml-2 text-[13px] font-normal text-[var(--text-muted)]">
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-primary)]">
                      <span className="inline-flex items-center gap-1.5">
                        {user.role === "ADMIN" ? (
                          <Shield className="w-4 h-4 text-[var(--primary)]" />
                        ) : (
                          <UserIcon className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                        {user.role === "ADMIN" ? "Admin" : "Member"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
                          user.enabled
                            ? "text-[var(--positive)]"
                            : "text-[var(--negative)]"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            user.enabled
                              ? "bg-[var(--positive)]"
                              : "bg-[var(--negative)]"
                          }`}
                        />
                        {user.enabled ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-[var(--text-primary)]">
                      {user._count.receipts}
                    </td>
                    <td className="py-3.5 px-4 tabular-nums text-[13px] text-[var(--text-muted)]">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(user);
                            setResetPasswordVal("");
                          }}
                          className="h-8 px-3 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          Reset password
                        </button>

                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmToggleUserId(
                                confirmingToggle ? null : user.id
                              )
                            }
                            className={`h-8 px-3 rounded-full border text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                              user.enabled
                                ? "border-[var(--border)] bg-[var(--bg-card)] text-[var(--negative)] hover:border-[var(--negative)]"
                                : "border-[var(--positive)]/40 bg-[var(--positive-tint)] text-[var(--positive)]"
                            }`}
                          >
                            {user.enabled ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                Reactivate
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {confirmingToggle && (
                    <tr className="bg-[var(--bg-subtle)]/70">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="text-[var(--text-primary)]">
                            {user.enabled
                              ? `Deactivate ${user.username}? They won't be able to sign in until reactivated.`
                              : `Reactivate ${user.username} so they can sign in again?`}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={togglingId === user.id}
                              onClick={() => handleToggleStatus(user)}
                              className="h-8 px-3.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-page)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {togglingId === user.id && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              )}
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmToggleUserId(null)}
                              className="h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* P0 Fix: Mobile Stacked Account Cards (Zero Cramped Icon Columns) */}
      <div className="md:hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
        {filteredUsers.map((user) => {
          const isSelf = user.id === currentUserId;
          const confirmingToggle = confirmToggleUserId === user.id;

          return (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                    {user.username}
                    {isSelf && (
                      <span className="ml-1.5 text-[13px] font-normal text-[var(--text-muted)]">
                        (You)
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)] tabular-nums">
                    {user.role === "ADMIN" ? "Admin" : "Member"} ·{" "}
                    {user._count.receipts}{" "}
                    {user._count.receipts === 1 ? "receipt" : "receipts"} ·{" "}
                    {formatDate(user.createdAt)}
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0 ${
                    user.enabled
                      ? "text-[var(--positive)]"
                      : "text-[var(--negative)]"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      user.enabled
                        ? "bg-[var(--positive)]"
                        : "bg-[var(--negative)]"
                    }`}
                  />
                  {user.enabled ? "Active" : "Deactivated"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(user);
                    setResetPasswordVal("");
                  }}
                  className="h-9 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[13px] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Reset password
                </button>

                {!isSelf && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmToggleUserId(confirmingToggle ? null : user.id)
                    }
                    className={`h-9 px-3.5 rounded-full border text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      user.enabled
                        ? "border-[var(--border)] bg-[var(--bg-card)] text-[var(--negative)]"
                        : "border-[var(--positive)]/40 bg-[var(--positive-tint)] text-[var(--positive)]"
                    }`}
                  >
                    {user.enabled ? (
                      <>
                        <UserX className="w-3.5 h-3.5" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        Reactivate
                      </>
                    )}
                  </button>
                )}
              </div>

              {confirmingToggle && (
                <div className="rounded-xl bg-[var(--bg-subtle)] p-3 space-y-2.5 text-[13px]">
                  <p className="text-[var(--text-primary)]">
                    {user.enabled
                      ? `Deactivate ${user.username}?`
                      : `Reactivate ${user.username}?`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={togglingId === user.id}
                      onClick={() => handleToggleStatus(user)}
                      className="h-8 px-3.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-page)] text-[13px] font-semibold cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmToggleUserId(null)}
                      className="h-8 px-3.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create User Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add household account"
        >
          <div
            className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            onClick={() => setIsCreateOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                Add household account
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close"
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="e.g. lucia"
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                />
                <p className="text-[13px] text-[var(--text-muted)]">
                  3 to 32 characters (letters, numbers, dot, underscore or
                  dash).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  Temporary password
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full h-10 pl-3.5 pr-12 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    aria-label={
                      showCreatePassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] cursor-pointer"
                  >
                    {showCreatePassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  Role
                </label>
                <select
                  value={createRole}
                  onChange={(e) =>
                    setCreateRole(e.target.value as "USER" | "ADMIN")
                  }
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="USER">Member — upload and review receipts</option>
                  <option value="ADMIN">Admin — full household settings</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Reset password for ${resetTarget.username}`}
        >
          <div
            className="fixed inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
            onClick={() => setResetTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-[20px] text-[var(--text-primary)]">
                Reset password for {resetTarget.username}
              </h2>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label="Close"
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[var(--text-primary)]">
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoFocus
                    value={resetPasswordVal}
                    onChange={(e) => setResetPasswordVal(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full h-10 pl-3.5 pr-12 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] focus:border-[var(--primary)] text-[14px] text-[var(--text-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    aria-label={
                      showResetPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-muted)] cursor-pointer"
                  >
                    {showResetPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[13px] text-[var(--text-muted)]">
                  Minimum 8 characters required.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="h-10 px-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-on)] text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save new password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
