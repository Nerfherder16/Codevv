import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Coins, Plus, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { PageLoading } from "../components/common/LoadingSpinner";
import { Modal } from "../components/common/Modal";
import { Input, Select } from "../components/common/Input";
import { EmptyState } from "../components/common/EmptyState";

interface WatchlistItem {
  id: string;
  project_id: string;
  label: string;
  address: string;
  network: string;
  created_by: string;
  created_at: string;
}

interface SolanaBalance {
  address: string;
  lamports: number;
  sol: number;
}

interface SolanaTransaction {
  signature: string;
  slot: number | null;
  block_time: number | null;
  success: boolean;
  fee: number | null;
}

const networkBadge: Record<string, string> = {
  devnet: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
  testnet:
    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  "mainnet-beta":
    "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
};

const truncAddr = (addr: string) => addr.slice(0, 8) + "..." + addr.slice(-4);

export function SolanaPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add address modal
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newNetwork, setNewNetwork] = useState("devnet");
  const [adding, setAdding] = useState(false);

  // Per-item state
  const [balances, setBalances] = useState<Record<string, SolanaBalance>>({});
  const [loadingBalance, setLoadingBalance] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<
    Record<string, SolanaTransaction[]>
  >({});
  const [loadingTxs, setLoadingTxs] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<WatchlistItem[]>(
        `/projects/${projectId}/solana/watchlist`,
      );
      setWatchlist(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load watchlist";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newAddress.trim()) {
      toast("Label and address are required.", "error");
      return;
    }
    setAdding(true);
    try {
      const item = await api.post<WatchlistItem>(
        `/projects/${projectId}/solana/watchlist`,
        {
          label: newLabel.trim(),
          address: newAddress.trim(),
          network: newNetwork,
        },
      );
      setWatchlist((prev) => [item, ...prev]);
      setAddOpen(false);
      setNewLabel("");
      setNewAddress("");
      setNewNetwork("devnet");
      toast("Address added!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add address";
      toast(msg, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/projects/${projectId}/solana/watchlist/${id}`);
      setWatchlist((prev) => prev.filter((w) => w.id !== id));
      if (expandedId === id) setExpandedId(null);
      toast("Address removed.", "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to remove address";
      toast(msg, "error");
    } finally {
      setDeleting(null);
    }
  };

  const fetchBalance = async (id: string) => {
    setLoadingBalance(id);
    try {
      const bal = await api.get<SolanaBalance>(
        `/projects/${projectId}/solana/watchlist/${id}/balance`,
      );
      setBalances((prev) => ({ ...prev, [id]: bal }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch balance";
      toast(msg, "error");
    } finally {
      setLoadingBalance(null);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!transactions[id]) {
      setLoadingTxs(id);
      try {
        const txs = await api.get<SolanaTransaction[]>(
          `/projects/${projectId}/solana/watchlist/${id}/transactions?limit=10`,
        );
        setTransactions((prev) => ({ ...prev, [id]: txs }));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load transactions";
        toast(msg, "error");
      } finally {
        setLoadingTxs(null);
      }
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="Blockchain"
        description="Monitor Solana addresses and on-chain activity."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Address
          </Button>
        }
      />

      {watchlist.length === 0 ? (
        <EmptyState
          icon={<Coins className="w-16 h-16" />}
          title="No addresses watched"
          description="Add a Solana address to start tracking balances and transactions."
          actionLabel="Add Address"
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map((item) => {
            const bal = balances[item.id];
            const isExpanded = expandedId === item.id;
            const txs = transactions[item.id];

            return (
              <Card key={item.id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal/10 text-teal shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {item.label}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      {truncAddr(item.address)}
                    </p>
                    <span
                      className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${networkBadge[item.network] || networkBadge.devnet}`}
                    >
                      {item.network}
                    </span>
                  </div>
                </div>

                {/* Balance */}
                <div className="flex items-center gap-2 mt-3">
                  {bal ? (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {bal.sol.toFixed(3)} SOL
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Balance not loaded
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={loadingBalance === item.id}
                    onClick={() => fetchBalance(item.id)}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleExpand(item.id)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {isExpanded ? "Hide Txs" : "Transactions"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deleting === item.id}
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Expanded transactions */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Recent Transactions
                    </p>
                    {loadingTxs === item.id ? (
                      <p className="text-xs text-gray-400">Loading...</p>
                    ) : !txs || txs.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        No transactions found.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {txs.map((tx) => (
                          <div
                            key={tx.signature}
                            className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  tx.success
                                    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                                    : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                }`}
                              >
                                {tx.success ? "OK" : "FAIL"}
                              </span>
                              <span className="font-mono text-gray-600 dark:text-gray-300 truncate">
                                {tx.signature.slice(0, 16)}...
                              </span>
                            </div>
                            {tx.slot !== null && (
                              <span className="text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                                Slot {tx.slot.toLocaleString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Address Modal */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setNewLabel("");
          setNewAddress("");
          setNewNetwork("devnet");
        }}
        title="Add Solana Address"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label
              htmlFor="addrLabel"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Label <span className="text-red-500">*</span>
            </label>
            <Input
              id="addrLabel"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Treasury Wallet"
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="addrAddress"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Address <span className="text-red-500">*</span>
            </label>
            <Input
              id="addrAddress"
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="e.g. 5YNmS1R9..."
            />
          </div>
          <div>
            <label
              htmlFor="addrNetwork"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Network
            </label>
            <Select
              id="addrNetwork"
              value={newNetwork}
              onChange={(e) => setNewNetwork(e.target.value)}
            >
              <option value="devnet">Devnet</option>
              <option value="testnet">Testnet</option>
              <option value="mainnet-beta">Mainnet Beta</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAddOpen(false);
                setNewLabel("");
                setNewAddress("");
                setNewNetwork("devnet");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={adding}>
              <Coins className="w-4 h-4" />
              Add Address
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
