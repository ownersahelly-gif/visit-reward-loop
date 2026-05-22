import { invokeAppApi } from "./edge";

type CreateBranchRequestInput = {
  restaurantId: string;
  requestType: "new" | "reissue";
  branchLabel: string;
  staffEmail?: string;
  staffPassword?: string;
  staffFullName?: string;
  existingStaffId?: string;
  shippingAddress: string;
  notes?: string;
};

export const createBranchRequest = (args: { data: CreateBranchRequestInput }) =>
  invokeAppApi<{ id: string }>("createBranchRequest", args.data);

export const listMyBranchRequests = (args: { data: { restaurantId: string } }) =>
  invokeAppApi<{ requests: any[] }>("listMyBranchRequests", args.data);

// Admin-side server functions historically had no input. The shim makes both
// call shapes work: `listAllBranchRequests()` and `listAllBranchRequests({ data })`.
export const listAllBranchRequests = (_args?: { data?: unknown }) =>
  invokeAppApi<{ requests: any[] }>("listAllBranchRequests", {});

export const acceptBranchRequest = (args: { data: { requestId: string } }) =>
  invokeAppApi<{ ok: true; staffId: string; token: string }>("acceptBranchRequest", args.data);

export const markBranchRequestShipped = (args: { data: { requestId: string } }) =>
  invokeAppApi<{ ok: true }>("markBranchRequestShipped", args.data);

export const markBranchRequestDelivered = (args: { data: { requestId: string } }) =>
  invokeAppApi<{ ok: true }>("markBranchRequestDelivered", args.data);

export const rejectBranchRequest = (args: { data: { requestId: string; reason: string } }) =>
  invokeAppApi<{ ok: true }>("rejectBranchRequest", args.data);
