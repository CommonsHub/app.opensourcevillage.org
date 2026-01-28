/**
 * Client-side hook for publishing NOSTR events
 * Handles event creation, signing, and publishing to relays
 */

'use client';

import { useState, useCallback } from 'react';
import {
  createProfileEvent,
  createOfferEvent,
  createRSVPEvent,
  createRSVPCancellationEvent,
  createPaymentRequestEvent,
  createNoteEvent,
  createReactionEvent,
  getStoredSecretKey,
  decodeNsec,
  type OfferEventOptions,
  type PaymentRequestOptions,
  type NoteEventOptions,
  type ReactionEventOptions,
} from '@/lib/nostr-events';
import { publishToAllRelays, getRelayUrls } from '@/lib/nostr';

/**
 * Options for publishing a payment request
 */
export interface PaymentRequestInput {
  /** Recipient's npub */
  recipient: string;
  /** Sender's npub (current user) */
  sender: string;
  /** Amount in tokens */
  amount: number;
  /** Context of the payment */
  context: 'rsvp' | 'tip' | 'transfer' | 'offer_creation' | 'workshop_proposal' | 'booking';
  /** Related event ID (e.g., offer ID for RSVP) */
  relatedEventId?: string;
  /** Human-readable description */
  description?: string;
  /** Method: transfer tokens between users, or burn for workshop proposals */
  method?: 'transfer' | 'burn';
}

interface PublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
  published?: string[];
  failed?: Array<{ url: string; error: string }>;
}

export function useNostrPublisher() {
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  /**
   * Publish a profile update event
   */
  const publishProfile = useCallback(async (profile: {
    name: string;
    about?: string;
    picture?: string;
  }): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing profile event...');
    setIsPublishing(true);
    setLastError(null);

    try {
      // Get stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      // Decode nsec to secret key
      const secretKey = decodeNsec(nsec);

      // Get configured relays to include in profile
      const relays = getRelayUrls();

      // Create and sign profile event (including relays)
      const event = createProfileEvent(secretKey, { ...profile, relays });
      console.log('[useNostrPublisher] Profile event created:', event.id);

      // Publish to relays (pass secretKey for AUTH handling)
      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ Profile event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish profile:', errorMsg);
      setLastError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsPublishing(false);
    }
  }, []);

  /**
   * Publish an offer/workshop event
   */
  const publishOffer = useCallback(async (offer: OfferEventOptions): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing offer event...');
    setIsPublishing(true);
    setLastError(null);

    try {
      // Get stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      // Decode nsec to secret key
      const secretKey = decodeNsec(nsec);

      // Create and sign offer event
      const event = createOfferEvent(secretKey, offer);
      console.log('[useNostrPublisher] Offer event created:', event.id);

      // Publish to relays (pass secretKey for AUTH handling)
      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ Offer event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish offer:', errorMsg);
      setLastError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsPublishing(false);
    }
  }, []);

  /**
   * Publish an RSVP event
   */
  const publishRSVP = useCallback(async (
    offerEventId: string,
    author: string
  ): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing RSVP event...');
    setIsPublishing(true);
    setLastError(null);

    try {
      // Get stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      // Decode nsec to secret key
      const secretKey = decodeNsec(nsec);

      // Create and sign RSVP event
      const event = createRSVPEvent(secretKey, offerEventId, author);
      console.log('[useNostrPublisher] RSVP event created:', event.id);

      // Publish to relays (pass secretKey for AUTH handling)
      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ RSVP event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish RSVP:', errorMsg);
      setLastError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsPublishing(false);
    }
  }, []);

  /**
   * Cancel an RSVP
   */
  const cancelRSVP = useCallback(async (rsvpEventId: string): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing RSVP cancellation event...');
    setIsPublishing(true);
    setLastError(null);

    try {
      // Get stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      // Decode nsec to secret key
      const secretKey = decodeNsec(nsec);

      // Create and sign cancellation event
      const event = createRSVPCancellationEvent(secretKey, rsvpEventId);
      console.log('[useNostrPublisher] RSVP cancellation event created:', event.id);

      // Publish to relays (pass secretKey for AUTH handling)
      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ RSVP cancellation event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to cancel RSVP:', errorMsg);
      setLastError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsPublishing(false);
    }
  }, []);

  /**
   * Publish a payment request event (kind 1734)
   * This triggers the payment processor to execute the token transfer
   */
  const publishPaymentRequest = useCallback(async (
    input: PaymentRequestInput
  ): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing payment request event...');
    setIsPublishing(true);
    setLastError(null);

    try {
      // Get stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      // Decode nsec to secret key
      const secretKey = decodeNsec(nsec);

      // Fetch token info
      const tokenResponse = await fetch('/api/token/info');
      const tokenData = await tokenResponse.json();

      if (!tokenData.success || !tokenData.token) {
        throw new Error('Token not deployed. Please contact an administrator.');
      }

      const { token } = tokenData;

      const method = input.method || 'transfer';
      const isBurn = method === 'burn';

      // For burn: only need sender wallet address (no recipient)
      // For transfer/mint: need both sender and recipient
      let senderWalletData: { success: boolean; walletAddress?: string; error?: string };
      let recipientWalletData: { success: boolean; walletAddress?: string; error?: string } = { success: true };

      if (isBurn) {
        // Burn only needs sender address
        const senderWalletResponse = await fetch(`/api/wallet/address/${input.sender}`);
        senderWalletData = await senderWalletResponse.json();
      } else {
        // Transfer/mint needs both addresses
        const [senderResponse, recipientResponse] = await Promise.all([
          fetch(`/api/wallet/address/${input.sender}`),
          fetch(`/api/wallet/address/${input.recipient}`),
        ]);

        senderWalletData = await senderResponse.json();
        recipientWalletData = await recipientResponse.json();
      }

      if (!senderWalletData.success) {
        throw new Error(`Failed to get sender wallet address: ${senderWalletData.error}`);
      }
      if (!isBurn && !recipientWalletData.success) {
        throw new Error(`Failed to get recipient wallet address: ${recipientWalletData.error}`);
      }

      // Create payment request options
      const paymentOptions: PaymentRequestOptions = {
        recipient: isBurn ? input.sender : input.recipient, // For burn, no recipient
        recipientAddress: isBurn ? '' : recipientWalletData.walletAddress!, // For burn, no recipient address
        sender: input.sender,
        senderAddress: senderWalletData.walletAddress,
        amount: input.amount,
        tokenAddress: token.address,
        chainId: token.chainId,
        tokenSymbol: token.symbol,
        context: input.context,
        relatedEventId: input.relatedEventId,
        description: input.description,
        method,
      };

      // Create and sign payment request event
      const event = createPaymentRequestEvent(secretKey, paymentOptions);
      console.log('[useNostrPublisher] Payment request event created:', event.id);

      // Publish to relays (pass secretKey for AUTH handling)
      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ Payment request event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish payment request:', errorMsg);
      setLastError(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    } finally {
      setIsPublishing(false);
    }
  }, []);

  /**
   * Publish a human-readable note (kind 1)
   * Used for activity that regular Nostr clients can display
   */
  const publishNote = useCallback(async (
    options: NoteEventOptions
  ): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing note event...');

    try {
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      const secretKey = decodeNsec(nsec);
      const event = createNoteEvent(secretKey, options);
      console.log('[useNostrPublisher] Note event created:', event.id);

      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ Note event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish note:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }, []);

  /**
   * Publish a reaction event (kind 7)
   * Used for reactions like RSVP confirmations with custom emoji
   */
  const publishReaction = useCallback(async (
    options: ReactionEventOptions
  ): Promise<PublishResult> => {
    console.log('[useNostrPublisher] Publishing reaction event...');

    try {
      const nsec = getStoredSecretKey();
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      const secretKey = decodeNsec(nsec);
      const event = createReactionEvent(secretKey, options);
      console.log('[useNostrPublisher] Reaction event created:', event.id);

      const result = await publishToAllRelays(event, secretKey);

      if (result.successful.length === 0) {
        throw new Error('Failed to publish to any relay');
      }

      console.log('[useNostrPublisher] ✓ Reaction event published successfully');
      return {
        success: true,
        eventId: event.id,
        published: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useNostrPublisher] ✗ Failed to publish reaction:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }, []);

  return {
    publishProfile,
    publishOffer,
    publishRSVP,
    cancelRSVP,
    publishPaymentRequest,
    publishNote,
    publishReaction,
    isPublishing,
    lastError,
  };
}
