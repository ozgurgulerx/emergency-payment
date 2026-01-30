import { z } from "zod";
import type { PiiCheckResult, PiiEntity } from "@/types/pii";

// Schema for PII entity from Azure response
const PiiEntitySchema = z.object({
  text: z.string(),
  category: z.string(),
  offset: z.number(),
  length: z.number(),
  confidenceScore: z.number(),
});

// Schema for Azure PII response
const AzurePiiResponseSchema = z.object({
  kind: z.literal("PiiEntityRecognitionResults"),
  results: z.object({
    documents: z.array(
      z.object({
        id: z.string(),
        redactedText: z.string(),
        entities: z.array(PiiEntitySchema),
        warnings: z.array(z.unknown()),
      })
    ),
    errors: z.array(z.unknown()),
    modelVersion: z.string(),
  }),
});

// PII categories to check for (banking-relevant)
export const BANKING_PII_CATEGORIES = [
  "Person",
  "PersonType",
  "PhoneNumber",
  "Email",
  "Address",
  "USBankAccountNumber",
  "CreditCardNumber",
  "USSocialSecurityNumber",
  "USDriversLicenseNumber",
  "USPassportNumber",
  "USIndividualTaxpayerIdentification",
  "InternationalBankingAccountNumber",
  "SWIFTCode",
  "IPAddress",
] as const;

export type BankingPiiCategory = (typeof BANKING_PII_CATEGORIES)[number];

interface CheckPiiOptions {
  text: string;
  categories?: BankingPiiCategory[];
  confidenceThreshold?: number;
}

/**
 * Check text for PII using Azure Language Service container
 */
export async function checkPii({
  text,
  categories = [...BANKING_PII_CATEGORIES],
  confidenceThreshold = 0.8,
}: CheckPiiOptions): Promise<PiiCheckResult> {
  const containerEndpoint = process.env.PII_CONTAINER_ENDPOINT;
  const endpoint = process.env.PII_ENDPOINT || containerEndpoint || "http://pii-ozguler.eastus.azurecontainer.io:5000";

  // Container endpoint - no auth needed
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const requestBody = {
      kind: "PiiEntityRecognition",
      parameters: {
        modelVersion: "latest",
      },
      analysisInput: {
        documents: [
          {
            id: "1",
            language: "en",
            text: text,
          },
        ],
      },
    };

    const response = await fetch(
      `${endpoint}/language/:analyze-text?api-version=2023-04-01`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PII check failed:", response.status, response.statusText, errorText);
      // On API error, allow the message through but log for monitoring
      return {
        hasPii: false,
        entities: [],
      };
    }

    const data = await response.json();
    const parsed = AzurePiiResponseSchema.safeParse(data);

    if (!parsed.success) {
      console.error("Failed to parse PII response:", parsed.error);
      return {
        hasPii: false,
        entities: [],
      };
    }

    const document = parsed.data.results.documents[0];
    if (!document) {
      return {
        hasPii: false,
        entities: [],
      };
    }

    // Filter entities by confidence threshold AND banking-relevant categories
    const filteredEntities: PiiEntity[] = document.entities
      .filter((e) =>
        e.confidenceScore >= confidenceThreshold &&
        categories.includes(e.category as BankingPiiCategory)
      )
      .map((e) => ({
        text: e.text,
        category: e.category,
        offset: e.offset,
        length: e.length,
        confidenceScore: e.confidenceScore,
      }));

    return {
      hasPii: filteredEntities.length > 0,
      entities: filteredEntities,
      redactedText: document.redactedText,
    };
  } catch (error) {
    console.error("PII check error:", error);
    // On network error, allow the message through but log for monitoring
    return {
      hasPii: false,
      entities: [],
    };
  }
}

/**
 * Format PII detection result for user-facing message
 */
export function formatPiiWarning(entities: PiiEntity[]): string {
  const categories = [...new Set(entities.map((e) => formatCategory(e.category)))];

  if (categories.length === 0) {
    return "Your message contains sensitive information that cannot be processed.";
  }

  if (categories.length === 1) {
    return `Your message contains ${categories[0]} information which cannot be processed for security reasons.`;
  }

  const lastCategory = categories.pop();
  return `Your message contains ${categories.join(", ")} and ${lastCategory} information which cannot be processed for security reasons.`;
}

/**
 * Format category name for display
 */
function formatCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    Person: "personal name",
    PersonType: "personal",
    PhoneNumber: "phone number",
    Email: "email address",
    Address: "address",
    USBankAccountNumber: "bank account number",
    CreditCardNumber: "credit card",
    USSocialSecurityNumber: "Social Security Number",
    USDriversLicenseNumber: "driver's license",
    USPassportNumber: "passport number",
    USIndividualTaxpayerIdentification: "tax ID",
    InternationalBankingAccountNumber: "IBAN",
    SWIFTCode: "SWIFT code",
    IPAddress: "IP address",
  };

  return categoryMap[category] || category.toLowerCase();
}
