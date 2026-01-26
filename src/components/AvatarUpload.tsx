/**
 * Avatar Upload Component
 *
 * Allows users to upload a custom avatar image.
 * Integrates with /api/avatar endpoint and updates NOSTR kind 0.
 *
 * Features:
 * - Image preview before upload
 * - File validation (type, size)
 * - Progress indicator
 * - Fallback to generated avatar
 *
 * @see specs/TECHNICAL_SPEC.md#avatar-upload-flow
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';

interface AvatarUploadProps {
  npub: string;
  currentAvatarUrl?: string;
  onAvatarUpdated?: (localUrl: string, blossomUrl: string | null) => void;
}

export function AvatarUpload({ npub, currentAvatarUrl, onAvatarUpdated }: AvatarUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get initial avatar (current or generated)
  const avatarUrl = previewUrl || currentAvatarUrl || getGeneratedAvatar(npub);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(false);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload a JPEG, PNG, or WebP image.');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  /**
   * Handle upload
   */
  const handleUpload = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('npub', npub);

      // Upload to server
      const response = await fetch('/api/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      // Success!
      setSuccess(true);
      setPreviewUrl(null); // Clear preview

      // Notify parent
      if (onAvatarUpdated) {
        onAvatarUpdated(data.localUrl, data.blossomUrl);
      }

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [npub, onAvatarUpdated]);

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    setPreviewUrl(null);
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Trigger file input click
   */
  const handleSelectClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      {/* Avatar Preview */}
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-200">
          <Image
            src={avatarUrl}
            alt="Avatar"
            fill
            className="object-cover"
            unoptimized // For data URLs and external URLs
          />
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-900 mb-1">Profile Picture</h3>
          <p className="text-xs text-gray-600 mb-2">
            Upload a custom avatar (JPEG, PNG, or WebP, max 5MB)
          </p>

          <div className="flex items-center gap-2">
            {!previewUrl && (
              <button
                type="button"
                onClick={handleSelectClick}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                Select Image
              </button>
            )}

            {previewUrl && (
              <>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-600">Avatar uploaded successfully!</p>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <p className="text-sm text-blue-600">Uploading avatar...</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generate avatar URL from npub using boring-avatars
 *
 * @see https://boringavatars.com/
 */
function getGeneratedAvatar(npub: string): string {
  // Use boring-avatars beam style with npub as seed
  // This creates a consistent generated avatar for each npub
  return `https://source.boringavatars.com/beam/120/${npub}?colors=264653,2a9d8f,e9c46a,f4a261,e76f51`;
}
