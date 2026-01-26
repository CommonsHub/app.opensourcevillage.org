'use client';

/**
 * Public profile page
 * Accessed via: /profile/[username]
 * Shows user profile with balance, offers, workshops, and social links
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { nip19 } from 'nostr-tools';
import { getStoredCredentials } from '@/lib/nostr-client';
import { getOrRequestInviteCode } from '@/lib/nostr-relay-client';
import { getSecretKey } from '@/lib/nostr-events';
import { useNostrEvents, type NostrEvent } from '@/hooks/useNostrEvents';
import SendTokensDrawer from '@/components/SendTokensDrawer';

/**
 * Convert npub to hex pubkey for comparison
 */
function npubToHex(npub: string): string | null {
  if (!npub) return null;
  // Already a hex pubkey
  if (/^[0-9a-f]{64}$/i.test(npub)) {
    return npub.toLowerCase();
  }
  // Convert npub to hex
  if (npub.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        return (decoded.data as string).toLowerCase();
      }
    } catch {
      return null;
    }
  }
  return null;
}

// Nostr event kind descriptions (NIP-01 and custom kinds)
const KIND_DESCRIPTIONS: Record<number, { name: string; description: string; icon: string }> = {
  0: { name: 'Profile Update', description: 'Updated user profile information like name, bio, or avatar', icon: '👤' },
  1: { name: 'Note', description: 'A public text post, similar to a tweet or status update', icon: '📝' },
  3: { name: 'Follow List', description: 'Updated the list of accounts this user follows', icon: '👥' },
  4: { name: 'Direct Message', description: 'An encrypted private message sent to another user', icon: '✉️' },
  5: { name: 'Deletion', description: 'Requested deletion of a previously published event', icon: '🗑️' },
  6: { name: 'Repost', description: 'Shared/reposted another user\'s note', icon: '🔄' },
  7: { name: 'Reaction', description: 'Liked or reacted to another event with an emoji', icon: '❤️' },
  9735: { name: 'Zap', description: 'Received a Lightning Network payment (zap) for content', icon: '⚡' },
  10002: { name: 'Relay List', description: 'Published preferred relay servers for communication', icon: '📡' },
  1734: { name: 'Token Transfer', description: 'A pending token transfer or mint request waiting to be processed', icon: '⏳' },
  1735: { name: 'Token Confirmed', description: 'A token transfer or mint that has been confirmed on the blockchain', icon: '✅' },
  22242: { name: 'Authentication', description: 'Authenticated with a relay server using NIP-42 protocol', icon: '🔐' },
  28934: { name: 'Group Join', description: 'Joined a private group by redeeming an invitation code', icon: '🎟️' },
  28935: { name: 'Invite Created', description: 'Generated a new invitation code to onboard another user', icon: '📨' },
  30023: { name: 'Article', description: 'Published a long-form article or blog post', icon: '📄' },
  30078: { name: 'App Data', description: 'Stored application-specific settings or data', icon: '💾' },
  31922: { name: 'Workshop', description: 'Created or updated a workshop/calendar event', icon: '📅' },
  31923: { name: 'Calendar RSVP', description: 'RSVPed to a calendar event', icon: '✋' },
};

/**
 * Shorten a hex pubkey for display
 */
function shortenPubkey(pubkey: string): string {
  if (!pubkey || pubkey.length < 12) return pubkey;
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`;
}

/**
 * Get a human-readable summary of what an event represents
 * @param event - The nostr event
 * @param isAuthor - Whether the profile user authored this event
 * @param profileHex - The hex pubkey of the profile being viewed (optional, for payment context)
 */
function getEventSummary(event: NostrEvent, isAuthor: boolean, profileHex?: string | null): string {
  const tags = new Map(event.tags.map(t => [t[0], t[1]]));
  const prefix = isAuthor ? '' : 'Was mentioned in: ';

  switch (event.kind) {
    case 0:
      try {
        const meta = JSON.parse(event.content);
        if (meta.name) return `${prefix}Profile updated to "${meta.name}"`;
        return `${prefix}Profile information updated`;
      } catch {
        return `${prefix}Profile updated`;
      }
    case 1:
      if (event.content) {
        const text = event.content.substring(0, 80);
        return `${prefix}${text}${event.content.length > 80 ? '...' : ''}`;
      }
      return `${prefix}Posted a note`;
    case 7:
      return `${prefix}Reacted with ${event.content || '👍'}`;
    case 1734: {
      // Payment request: p = recipient, P = sender
      const method = tags.get('method') || 'transfer';
      const amount = tags.get('amount');
      const context = tags.get('context');
      const amountNum = amount ? Number(amount) / 1e6 : 0;
      const tokenLabel = amountNum === 1 ? 'token' : 'tokens';
      const recipientPubkey = tags.get('p');
      const senderPubkey = tags.get('P');

      // Determine if profile user is sender or recipient
      const isSender = profileHex && senderPubkey?.toLowerCase() === profileHex.toLowerCase();
      const isRecipient = profileHex && recipientPubkey?.toLowerCase() === profileHex.toLowerCase();

      let contextLabel = '';
      if (context === 'badge_claim') contextLabel = ' (badge claim)';
      else if (context === 'rsvp') contextLabel = ' (RSVP)';
      else if (context === 'tip') contextLabel = ' (tip)';

      if (method === 'mint') {
        if (isRecipient) {
          return `Minting ${amountNum} ${tokenLabel}${contextLabel}`;
        }
        return `Minting ${amountNum} ${tokenLabel} to ${shortenPubkey(recipientPubkey || '')}${contextLabel}`;
      }

      if (method === 'burn') {
        return `Burning ${amountNum} ${tokenLabel}${contextLabel}`;
      }

      // Transfer
      if (isSender) {
        return `Sending ${amountNum} ${tokenLabel} to ${shortenPubkey(recipientPubkey || '')}${contextLabel}`;
      } else if (isRecipient) {
        return `Receiving ${amountNum} ${tokenLabel} from ${shortenPubkey(senderPubkey || '')}${contextLabel}`;
      }
      return `Transferring ${amountNum} ${tokenLabel}${contextLabel}`;
    }
    case 1735: {
      // Payment receipt: p = recipient, P = sender
      const method = tags.get('method') || 'transfer';
      const status = tags.get('status');
      const amount = tags.get('amount');
      const context = tags.get('context');
      const amountNum = amount ? Number(amount) / 1e6 : 0;
      const tokenLabel = amountNum === 1 ? 'token' : 'tokens';
      const recipientPubkey = tags.get('p');
      const senderPubkey = tags.get('P');

      // Determine if profile user is sender or recipient
      const isSender = profileHex && senderPubkey?.toLowerCase() === profileHex.toLowerCase();
      const isRecipient = profileHex && recipientPubkey?.toLowerCase() === profileHex.toLowerCase();

      let contextLabel = '';
      if (context === 'badge_claim') contextLabel = ' (badge claim)';
      else if (context === 'rsvp') contextLabel = ' (RSVP)';
      else if (context === 'tip') contextLabel = ' (tip)';

      if (status === 'success') {
        if (method === 'mint') {
          if (isRecipient) {
            return `Minted ${amountNum} ${tokenLabel}${contextLabel}`;
          }
          return `Minted ${amountNum} ${tokenLabel} to ${shortenPubkey(recipientPubkey || '')}${contextLabel}`;
        }

        if (method === 'burn') {
          return `Burnt ${amountNum} ${tokenLabel}${contextLabel}`;
        }

        // Transfer
        if (isSender) {
          return `Sent ${amountNum} ${tokenLabel} to ${shortenPubkey(recipientPubkey || '')}${contextLabel}`;
        } else if (isRecipient) {
          return `Received ${amountNum} ${tokenLabel} from ${shortenPubkey(senderPubkey || '')}${contextLabel}`;
        }
        return `Transferred ${amountNum} ${tokenLabel}${contextLabel}`;
      }
      return `❌ Transaction failed`;
    }
    case 28934:
      return `${prefix}Joined the village`;
    case 28935:
      return `${prefix}Created an invitation`;
    case 22242:
      return `${prefix}Authenticated with relay`;
    case 31922: {
      // NIP-52 calendar event (workshop)
      const titleTag = event.tags.find(t => t[0] === 'title' || t[0] === 'name');
      const title = titleTag?.[1] || 'a workshop';
      return `${prefix}${isAuthor ? 'Created/updated' : 'Mentioned in'} workshop: "${title}"`;
    }
    case 31923: {
      // NIP-52 calendar RSVP
      return `${prefix}RSVPed to an event`;
    }
    default: {
      const kindInfo = KIND_DESCRIPTIONS[event.kind];
      if (kindInfo) return `${prefix}${kindInfo.name}`;
      return `${prefix}Event (kind ${event.kind})`;
    }
  }
}

interface ProfileData {
  username: string;
  npub: string;
  serialNumber?: string; // Only available in dev mode
  profile: {
    name?: string;
    shortbio?: string;
    talkAbout?: string;
    helpWith?: string;
    links?: Array<{ type: string; url: string }>;
    invitedBy?: string;
    invitees?: string[];
  };
  balance: {
    confirmed: number;
    pending: number;
    total: number;
  };
  offers: any[];
  rsvps: any[];
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [expandedTalkAbout, setExpandedTalkAbout] = useState(false);
  const [expandedHelpWith, setExpandedHelpWith] = useState(false);

  // Invite state
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [remainingInvites, setRemainingInvites] = useState(4);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showInviteQR, setShowInviteQR] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Send tokens drawer state
  const [showSendDrawer, setShowSendDrawer] = useState(false);
  const [senderBalance, setSenderBalance] = useState(0);
  const [balanceAnimating, setBalanceAnimating] = useState(false);

  // API-fetched nostr events (for payment events not on relay)
  const [apiEvents, setApiEvents] = useState<NostrEvent[]>([]);

  // Token info for explorer link
  const [tokenInfo, setTokenInfo] = useState<{ address: string; explorer: string; chain: string } | null>(null);
  // Wallet address for Safe link
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Subscribe to Nostr events for this user
  const {
    events: nostrEvents,
    isLoading: eventsLoading,
    isConnected: eventsConnected,
  } = useNostrEvents({
    authorPubkey: profile?.npub,
    mentionedPubkey: profile?.npub,
    limit: 20,
    autoConnect: !!profile?.npub,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/profile/${username}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || 'Profile not found');
          setIsLoading(false);
          return;
        }

        setProfile(data.profile);

        // Fetch live balance from blockchain, token info, and wallet address
        if (data.profile.npub) {
          try {
            const [balanceResponse, tokenResponse, walletResponse] = await Promise.all([
              fetch(`/api/balance/${data.profile.npub}`),
              fetch('/api/token/info'),
              fetch(`/api/wallet/address/${data.profile.npub}`),
            ]);
            const balanceData = await balanceResponse.json();
            const tokenData = await tokenResponse.json();
            const walletData = await walletResponse.json();

            if (balanceData.success && balanceData.balance) {
              // Update profile with live balance
              setProfile((prev) => prev ? {
                ...prev,
                balance: {
                  confirmed: balanceData.balance.confirmed ?? balanceData.balance.total ?? 0,
                  pending: 0,
                  total: balanceData.balance.total ?? balanceData.balance.confirmed ?? 0,
                },
              } : null);
            }

            if (tokenData.success && tokenData.token) {
              setTokenInfo({
                address: tokenData.token.address,
                explorer: tokenData.token.explorer,
                chain: tokenData.token.chain,
              });
            }

            if (walletData.success && walletData.walletAddress) {
              setWalletAddress(walletData.walletAddress);
            }
          } catch (err) {
            console.error('Failed to fetch balance/token info:', err);
            // Keep using cached balance from profile
          }
        }

        // Check if this is the user's own profile
        const credentials = getStoredCredentials();
        if (credentials && credentials.username === data.profile.username) {
          setIsOwnProfile(true);
        }

        setIsLoading(false);

        // Load invite info for own profile
        if (credentials && credentials.username === data.profile.username) {
          // Check for stored invite code
          const storedCode = localStorage.getItem('osv_invite_code');
          if (storedCode) {
            setInviteCode(storedCode);
          }

          // Get remaining invites
          const invitees = data.profile.profile.invitees || [];
          setRemainingInvites(4 - invitees.length);

          // Automatically request invite code if not stored and has remaining invites
          if (!storedCode && invitees.length < 4) {
            requestInviteCodeAutomatically();
          }
        }

      } catch (err) {
        console.error('Failed to fetch profile:', err);
        setError('Failed to load profile');
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  // Fetch sender's balance when viewing another profile
  useEffect(() => {
    const fetchSenderBalance = async () => {
      if (isOwnProfile) return; // Don't need sender balance on own profile

      const credentials = getStoredCredentials();
      if (!credentials?.npub) return;

      try {
        const response = await fetch(`/api/balance/${credentials.npub}`);
        const data = await response.json();
        if (data.success && data.balance) {
          setSenderBalance(data.balance.confirmed ?? data.balance.total ?? 0);
        }
      } catch (err) {
        console.error('Failed to fetch sender balance:', err);
      }
    };

    fetchSenderBalance();
  }, [isOwnProfile]);

  // Fetch payment events from API (for events not stored on relay)
  useEffect(() => {
    const fetchApiEvents = async () => {
      if (!profile?.npub) return;

      try {
        const response = await fetch(`/api/nostr-events/${profile.npub}`);
        const data = await response.json();
        if (data.success && data.events) {
          setApiEvents(data.events);
        }
      } catch (err) {
        console.error('Failed to fetch API events:', err);
      }
    };

    fetchApiEvents();
  }, [profile?.npub]);

  // Automatically request invite code when profile loads (if not already stored)
  const requestInviteCodeAutomatically = async () => {
    // Don't request if already loading or have a code
    if (inviteLoading || inviteCode) return;

    setInviteLoading(true);

    try {
      // Get the user's secret key from localStorage
      const secretKey = getSecretKey();
      if (!secretKey) {
        console.log('[Profile] No secret key available for automatic invite code request');
        setInviteLoading(false);
        return;
      }

      console.log('[Profile] Automatically requesting invite code...');

      // Request invite code from relay (client-side)
      const result = await getOrRequestInviteCode(secretKey);

      if (result.success && result.inviteCode) {
        console.log('[Profile] Invite code received and stored');
        setInviteCode(result.inviteCode);
      } else {
        console.log('[Profile] Failed to get invite code:', result.error);
        // Don't show error for automatic request - user can manually retry
      }
    } catch (err) {
      console.error('[Profile] Failed to auto-request invite code:', err);
      // Don't show error for automatic request
    } finally {
      setInviteLoading(false);
    }
  };

  // Generate or retrieve invite code (client-side relay interaction) - manual button click
  const handleGetInviteCode = async () => {
    if (!profile) return;

    // If we already have a code, it's already shown
    if (inviteCode) return;

    setInviteLoading(true);
    setInviteError('');

    try {
      // Get the user's secret key from localStorage
      const secretKey = getSecretKey();
      if (!secretKey) {
        setInviteError('Please scan your badge to authenticate first');
        setInviteLoading(false);
        return;
      }

      // Request invite code from relay (client-side)
      const result = await getOrRequestInviteCode(secretKey);

      if (!result.success || !result.inviteCode) {
        setInviteError(result.error || 'Failed to get invite code from relay');
        setInviteLoading(false);
        return;
      }

      setInviteCode(result.inviteCode);

    } catch (err) {
      console.error('Failed to get invite code:', err);
      setInviteError('Failed to generate invite code');
    } finally {
      setInviteLoading(false);
    }
  };

  // Copy invite code to clipboard
  const handleCopyInviteCode = async () => {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const getSocialIcon = (type: string) => {
    switch (type) {
      case 'github':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        );
      case 'twitter':
      case 'x':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        );
      case 'bluesky':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.096 1.266.527 1.718.027 2.124-.061 2.864.033 3.518c.378 2.617 1.464 8.765 2.517 10.833 1.052 2.066 3.145 2.826 5.347 2.817-2.42.138-5.036.784-6.347 2.817-1.311 2.033-.693 4.643 2.268 5.463 2.96.82 7.035-1.117 8.182-3.785 1.147 2.668 5.221 4.605 8.182 3.785 2.96-.82 3.579-3.43 2.268-5.463-1.311-2.033-3.927-2.679-6.347-2.817 2.202.009 4.295-.751 5.347-2.817 1.053-2.068 2.14-8.216 2.517-10.833.095-.654.006-1.394-.493-1.8-.57-.452-2.039-.774-4.676 1.087-2.751 1.942-5.711 5.881-6.798 7.995z"/>
          </svg>
        );
      case 'website':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
        );
    }
  };

  const formatSocialUrl = (url: string, type: string): string => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      const pathname = urlObj.pathname;

      // For GitHub, show github.com/username
      if (type === 'github') {
        return `github.com${pathname}`;
      }

      // For Twitter/X, show x.com/username or twitter.com/username
      if (type === 'twitter' || type === 'x') {
        return `${hostname}${pathname}`;
      }

      // For Bluesky, show bsky.app/profile/username
      if (type === 'bluesky') {
        return `${hostname}${pathname}`;
      }

      // For websites, show just the domain
      if (type === 'website') {
        return hostname;
      }

      // Default: show hostname + path
      return `${hostname}${pathname}`;
    } catch {
      // If URL parsing fails, return original
      return url;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Profile Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {profile.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {profile.profile.name ? `Hi, I'm ${profile.profile.name}` : `@${profile.username}`}
                  </h2>
                  <p className="text-gray-600 text-sm">@{profile.username}</p>
                </div>
                {isOwnProfile && (
                  <button
                    className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                    onClick={() => router.push('/profile/edit')}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>

          {profile.profile.shortbio && (
            <p className="text-gray-700 mb-4">{profile.profile.shortbio}</p>
          )}

          <div className={`bg-blue-50 rounded-lg p-3 mb-4 transition-all duration-500 ${balanceAnimating ? 'ring-2 ring-green-400 bg-green-50' : ''}`}>
            <p className="text-sm text-gray-700 flex items-center gap-2">
              <span className="font-semibold">Balance:</span>{' '}
              <span className={`text-lg font-bold text-blue-600 transition-all duration-300 ${balanceAnimating ? 'text-green-600 scale-110 inline-block' : ''}`}>
                {profile.balance.confirmed} tokens
              </span>
              {profile.balance.pending > 0 && (
                <span className="text-gray-500"> ({profile.balance.pending} pending)</span>
              )}
              {balanceAnimating && (
                <span className="ml-2 text-green-600 animate-bounce inline-block">↑</span>
              )}
              {tokenInfo && walletAddress && (
                <a
                  href={`https://app.safe.global/home?safe=${tokenInfo.chain === 'base' || tokenInfo.chain === 'base_sepolia' ? 'base' : 'gno'}:${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition ml-1"
                  title="View wallet on Safe"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </p>
          </div>

          {/* Talk About Section */}
          {profile.profile.talkAbout && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-1">I&apos;d love to talk about:</h3>
              <p className="text-gray-700 text-sm">
                {expandedTalkAbout
                  ? profile.profile.talkAbout
                  : truncateText(profile.profile.talkAbout)}
                {profile.profile.talkAbout.length > 100 && (
                  <button
                    className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                    onClick={() => setExpandedTalkAbout(!expandedTalkAbout)}
                  >
                    {expandedTalkAbout ? 'Show less' : 'Read more'}
                  </button>
                )}
              </p>
            </div>
          )}

          {/* Help With Section */}
          {profile.profile.helpWith && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-1">I could use help with:</h3>
              <p className="text-gray-700 text-sm">
                {expandedHelpWith
                  ? profile.profile.helpWith
                  : truncateText(profile.profile.helpWith)}
                {profile.profile.helpWith.length > 100 && (
                  <button
                    className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                    onClick={() => setExpandedHelpWith(!expandedHelpWith)}
                  >
                    {expandedHelpWith ? 'Show less' : 'Read more'}
                  </button>
                )}
              </p>
            </div>
          )}

          {!isOwnProfile && (
            <button
              className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowSendDrawer(true)}
              disabled={senderBalance <= 0}
            >
              {senderBalance > 0 ? 'Send Tokens' : 'No tokens to send'}
            </button>
          )}
        </div>

        {/* Social Links */}
        {profile.profile.links && profile.profile.links.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">More about me:</h3>
            <div className="space-y-2">
              {profile.profile.links.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition group"
                >
                  <span className="text-gray-600 group-hover:text-blue-600 transition">
                    {getSocialIcon(link.type)}
                  </span>
                  <span className="text-sm font-medium">
                    {formatSocialUrl(link.url, link.type)}
                  </span>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Call to Action - shown only for own profile */}
        {isOwnProfile && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 mt-4 text-white">
            <h2 className="text-xl font-bold mb-2">Have something to offer?</h2>
            <p className="text-sm opacity-90 mb-4">Share your skills, time, or resources with the community</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push('/offers/create?type=other')}
                className="bg-white text-blue-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition text-sm"
              >
                🎁 Make an Offer
              </button>
              <button
                onClick={() => router.push('/offers/create?type=workshop')}
                className="bg-white bg-opacity-20 text-white font-semibold py-2 px-6 rounded-lg hover:bg-opacity-30 transition text-sm border border-white"
              >
                🎓 Propose a Workshop
              </button>
            </div>
          </div>
        )}

        {/* Onboard a Villager - shown only for own profile */}
        {isOwnProfile && (
          <div className="bg-white rounded-lg shadow-sm p-6 mt-4">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">Onboard a Villager</h3>
              <p className="text-sm text-gray-500">
                {remainingInvites > 0
                  ? `You can onboard ${remainingInvites} more villager${remainingInvites > 1 ? 's' : ''}`
                  : 'You have reached your onboarding limit'}
              </p>
            </div>

            {inviteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{inviteError}</p>
              </div>
            )}

            {inviteLoading && !inviteCode && (
              <p className="text-sm text-gray-500">Loading invitation code...</p>
            )}

            {inviteCode && remainingInvites > 0 && (
              <div className="space-y-4">
                {/* Show/Hide QR Code Link */}
                <button
                  onClick={() => setShowInviteQR(!showInviteQR)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  {showInviteQR ? 'Hide my invitation code' : 'Show my invitation code'}
                </button>

                {/* QR Code Section */}
                {showInviteQR && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <QRCodeSVG
                        value={inviteCode}
                        size={200}
                        level="M"
                        includeMargin={true}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center max-w-xs">
                      Scan this QR code to get the invitation code
                    </p>

                    {/* Copy Code Link */}
                    <button
                      onClick={handleCopyInviteCode}
                      className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {codeCopied ? 'Copied!' : 'Copy invitation code'}
                    </button>
                  </div>
                )}

                {/* Show invitees if any */}
                {profile?.profile.invitees && profile.profile.invitees.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Villagers you&apos;ve onboarded ({profile.profile.invitees.length}/4):
                    </p>
                    <div className="space-y-1">
                      {profile.profile.invitees.map((inviteeNpub, index) => (
                        <p key={index} className="text-xs text-gray-500 font-mono truncate">
                          {inviteeNpub.substring(0, 20)}...
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activity - Nostr events (at the bottom) */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Activity</h3>
            {eventsConnected && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Live
              </span>
            )}
          </div>

          {(() => {
            // Merge relay events with API events, deduplicate by ID
            const eventMap = new Map<string, NostrEvent>();
            for (const event of nostrEvents) {
              eventMap.set(event.id, event);
            }
            for (const event of apiEvents) {
              if (!eventMap.has(event.id)) {
                eventMap.set(event.id, event);
              }
            }
            const allEvents = Array.from(eventMap.values())
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 50);

            const profileHex = npubToHex(profile?.npub || '');

            if (eventsLoading && allEvents.length === 0) {
              return <p className="text-gray-500 text-sm">Loading activity...</p>;
            }
            if (allEvents.length === 0) {
              return <p className="text-gray-500 text-sm">No activity yet.</p>;
            }

            return (
              <div className="space-y-2">
                {allEvents.filter(event => event && event.id && event.pubkey).map((event) => {
                  const isExpanded = expandedEvents.has(event.id);
                  const kindInfo = KIND_DESCRIPTIONS[event.kind];
                  // Check if this user authored the event (compare hex pubkeys)
                  const isAuthor = profileHex && event.pubkey ? event.pubkey.toLowerCase() === profileHex : false;
                  const summary = getEventSummary(event, isAuthor, profileHex);

                return (
                  <div
                    key={event.id}
                    className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => {
                      setExpandedEvents((prev) => {
                        const next = new Set(prev);
                        if (next.has(event.id)) {
                          next.delete(event.id);
                        } else {
                          next.add(event.id);
                        }
                        return next;
                      });
                    }}
                  >
                    {/* Collapsed view: icon + summary + datetime */}
                    <div className="flex items-start gap-2">
                      {/* Icon */}
                      <span className="text-lg flex-shrink-0" title={kindInfo?.name || `Kind ${event.kind}`}>
                        {kindInfo?.icon || '📋'}
                      </span>

                      {/* Summary and datetime */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">
                          {summary}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(event.created_at * 1000).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      {/* Expand indicator */}
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Expanded view */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        {/* Kind badge with tooltip */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="relative group">
                            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded cursor-help">
                              {kindInfo?.name || `Kind ${event.kind}`}
                            </span>
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                                <div className="font-semibold">Kind {event.kind}</div>
                                <div className="text-gray-300 mt-0.5">
                                  {kindInfo?.description || 'Unknown event type'}
                                </div>
                                <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>
                          </div>
                          {!isAuthor && (
                            <span className="text-xs text-blue-500">mentioned</span>
                          )}
                        </div>

                        {/* Show content if exists and meaningful */}
                        {event.content && event.content.length > 0 && (
                          <p className="text-sm text-gray-600 break-words mb-2">
                            {event.content.length > 200
                              ? event.content.substring(0, 200) + '...'
                              : event.content}
                          </p>
                        )}

                        {/* Show relevant tags */}
                        {event.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {event.tags
                              .filter((tag) => ['t', 'context', 'method', 'symbol', 'status', 'amount'].includes(tag[0]))
                              .slice(0, 6)
                              .map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                                >
                                  {tag[0]}: {tag[1]?.substring(0, 20)}
                                  {tag[1]?.length > 20 ? '...' : ''}
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Links */}
                        <div className="flex items-center gap-3">
                          <a
                            href={`https://njump.me/${event.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-600"
                          >
                            View on njump →
                          </a>
                        </div>

                        {/* JSON view */}
                        <details className="mt-3">
                          <summary className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                            Show raw event
                          </summary>
                          <div className="mt-2 bg-gray-900 rounded-lg p-3 overflow-x-auto">
                            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
                              {JSON.stringify(event, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            );
          })()}
        </div>

      </main>

      {/* Send Tokens Drawer */}
      {!isOwnProfile && profile && (
        <SendTokensDrawer
          isOpen={showSendDrawer}
          onClose={() => setShowSendDrawer(false)}
          recipientUsername={profile.username}
          recipientNpub={profile.npub}
          senderBalance={senderBalance}
          onSuccess={(newBalance) => {
            setSenderBalance(newBalance);
            setBalanceAnimating(true);
            // Refresh recipient's balance after a short delay
            setTimeout(async () => {
              try {
                const response = await fetch(`/api/balance/${profile.npub}`);
                const data = await response.json();
                if (data.success && data.balance) {
                  setProfile((prev) => prev ? {
                    ...prev,
                    balance: {
                      confirmed: data.balance.confirmed ?? data.balance.total ?? 0,
                      pending: 0,
                      total: data.balance.total ?? data.balance.confirmed ?? 0,
                    },
                  } : null);
                }
              } catch (err) {
                console.error('Failed to refresh recipient balance:', err);
              }
              setBalanceAnimating(false);
            }, 3000);
          }}
        />
      )}
    </div>
  );
}
