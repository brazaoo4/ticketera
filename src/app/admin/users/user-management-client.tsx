"use client";

import React, { useState } from "react";
import {
  UserPlus,
  Shield,
  User,
  Key,
  Power,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<SerializedUser | null>(
    null
  );

  // Create Form State
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"USER" | "ADMIN">("USER");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Reset Password State
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Toggle Status State
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const generateRandomPassword = () => {
    const chars =
      "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    const formData = new FormData();
    formData.append("username", createUsername);
    formData.append("password", createPassword);
    formData.append("role", createRole);

    const res = await createUserAction(formData);
    setIsCreating(false);

    if (res.success) {
      setIsCreateOpen(false);
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("USER");
      setActionNotice({
        type: "success",
        message: `User "${createUsername}" created successfully.`,
      });
      setTimeout(() => setActionNotice(null), 4000);
    } else {
      setCreateError(res.error || "Failed to create user.");
    }
  };

  const handleToggleStatus = async (user: SerializedUser) => {
    if (user.id === currentUserId) return;
    setTogglingId(user.id);
    setActionNotice(null);

    const res = await toggleUserStatusAction(user.id);
    setTogglingId(null);

    if (res.success) {
      setActionNotice({
        type: "success",
        message: `Status of "${user.username}" updated to: ${
          res.enabled ? "Active" : "Disabled"
        }.`,
      });
      setTimeout(() => setActionNotice(null), 4000);
    } else {
      setActionNotice({
        type: "error",
        message: res.error || "Could not update user status.",
      });
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;

    setResetError(null);
    setIsResetting(true);

    const res = await resetPasswordAction(resetTargetUser.id, newPassword);
    setIsResetting(false);

    if (res.success) {
      setResetSuccess(true);
      setTimeout(() => {
        setResetSuccess(false);
        setResetTargetUser(null);
        setNewPassword("");
      }, 1500);
    } else {
      setResetError(res.error || "Failed to reset password.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-150 ${
            actionNotice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="p-1 hover:opacity-80 transition-opacity"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <span>System Users</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs tabular-nums font-mono border border-zinc-700/60">
              {users.length}
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Accounts authorized to upload receipts and access the platform.
          </p>
        </div>

        <button
          onClick={() => {
            setCreatePassword(generateRandomPassword());
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-zinc-950 font-semibold text-xs shadow-md shadow-emerald-500/20 transition-all"
        >
          <UserPlus className="w-4 h-4 stroke-[2.2]" />
          <span>Create User</span>
        </button>
      </div>

      {/* Users Table Card */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Receipts Uploaded</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {users.map((u) => {
                const isCurrent = u.id === currentUserId;
                const isToggling = togglingId === u.id;

                return (
                  <tr
                    key={u.id}
                    className="hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* User */}
                    <td className="py-3.5 px-4 font-medium text-zinc-200">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
                          {u.role === "ADMIN" ? (
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <User className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono font-semibold">
                            {u.username}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] text-emerald-400">
                              (Your current session)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      {u.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-[11px] font-medium">
                          ADMIN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-mono text-[11px]">
                          USER
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {u.enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          <span>Disabled</span>
                        </span>
                      )}
                    </td>

                    {/* Receipts Count */}
                    <td className="py-3.5 px-4 text-right tabular-nums font-mono text-zinc-300">
                      {u._count.receipts}
                    </td>

                    {/* Created Date */}
                    <td className="py-3.5 px-4 font-mono text-zinc-400 tabular-nums text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle Status */}
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={isCurrent || isToggling}
                          title={
                            isCurrent
                              ? "You cannot disable your own active account"
                              : u.enabled
                              ? "Disable account"
                              : "Enable account"
                          }
                          className={`p-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            u.enabled
                              ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                              : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Power className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Reset Password */}
                        <button
                          onClick={() => {
                            setResetTargetUser(u);
                            setNewPassword(generateRandomPassword());
                            setResetError(null);
                          }}
                          title="Reset password"
                          className="p-1.5 rounded-lg border border-zinc-700/80 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create User Dialog */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3
                  id="create-user-title"
                  className="text-base font-semibold text-zinc-100"
                >
                  New User
                </h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{createError}</div>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-mono text-zinc-300">
                  USERNAME
                </label>
                <input
                  type="text"
                  required
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="e.g. nuno, maria"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-zinc-300">PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateRandomPassword())}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate random</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[10px] text-zinc-500 font-mono">
                  Minimum 6 characters. Share this password with the user.
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-mono text-zinc-300">
                  SYSTEM ROLE
                </label>
                <select
                  value={createRole}
                  onChange={(e) =>
                    setCreateRole(e.target.value as "USER" | "ADMIN")
                  }
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                >
                  <option value="USER">USER (Upload and review receipts)</option>
                  <option value="ADMIN">
                    ADMIN (Full access and user management)
                  </option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isCreating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Save User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Reset Password Dialog */}
      {resetTargetUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResetTargetUser(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                <h3
                  id="reset-password-title"
                  className="text-base font-semibold text-zinc-100"
                >
                  Reset Password
                </h3>
              </div>
              <button
                onClick={() => setResetTargetUser(null)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Setting a new password for user:{" "}
              <strong className="text-zinc-200 font-mono">
                {resetTargetUser.username}
              </strong>
            </p>

            {resetSuccess && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>Password reset successfully!</div>
              </div>
            )}

            {resetError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{resetError}</div>
              </div>
            )}

            <form
              onSubmit={handleResetPasswordSubmit}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-zinc-300">
                    NEW PASSWORD
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate random</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isResetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
