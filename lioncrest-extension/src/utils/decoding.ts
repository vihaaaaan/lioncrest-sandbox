import { Base64 } from 'js-base64';

/**
 * Decodes a Base64URL-encoded string used in the Gmail API back into plain text.
 * Uses the js-base64 library, which correctly handles Base64URL.
 * * @param encodedData The Base64URL-encoded string.
 * @returns The decoded plain text content (UTF-8 assumed).
 */
export const Base64Decode = (encodedData: string): string => {
    // The Base64.decode() method from the library automatically
    // handles both standard and URL-safe Base64 strings.
    return Base64.decode(encodedData);
};

/**
 * Traverses a gmail message payload to find the plain text body and decodes it.
 * @param payload The raw message payload object.
 * @returns The decoded plain text content.
 */
export const decodeMessageContent = (payload: any): string => {
    // 1. Check for nested parts (common for multipart/alternative messages)
    if (payload.parts) {
        // Prioritize finding the 'text/plain' part for clean content
        const plainPart = payload.parts.find((part: any) => part.mimeType === 'text/plain');

        if (plainPart && plainPart.body?.data) {
            // Decode the Base64URL-encoded data (must use Base64Decode utility)
            return Base64Decode(plainPart.body.data);
        }

        // Fallback: recursively check nested parts if no direct plain text found
        for (const part of payload.parts) {
            const content = decodeMessageContent(part);
            if (content) return content;
        }
    }

    // 2. Check the primary payload body (for non-multipart messages)
    if (payload.body?.data) {
        return Base64Decode(payload.body.data);
    }

    // 3. Fallback to snippet or empty string if content is missing
    return payload.snippet || "";
};