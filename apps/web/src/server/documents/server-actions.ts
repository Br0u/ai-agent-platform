"use server";

import {
  createDefaultDocumentActions,
  type DocumentActionState,
} from "./actions";

export async function createDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().createDocumentAction(
    previous,
    formData,
  );
}

export async function saveDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().saveDocumentAction(previous, formData);
}

export async function publishDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().publishDocumentAction(
    previous,
    formData,
  );
}

export async function archiveDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().archiveDocumentAction(
    previous,
    formData,
  );
}

export async function deleteDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().deleteDocumentAction(
    previous,
    formData,
  );
}

export async function restoreDocumentAction(
  previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return createDefaultDocumentActions().restoreDocumentAction(
    previous,
    formData,
  );
}
