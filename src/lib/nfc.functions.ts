// Client wrappers around the `app-api` edge function. Call shape is preserved
// from the old createServerFn API: `fn({ data: { ... } })`.
import { invokeAppApi } from "./edge";

type NfcStampInput = { restaurantId: string; offerId: string; nfcToken: string };
type AdminStampInput = { restaurantId: string; offerId: string };
type SetTokenInput = { staffId: string; regenerate?: boolean };

type StampResult = {
  ok: boolean;
  branch: string;
  title: string;
  stamped: number;
  required: number;
};

export const stampVisitByNfc = (args: { data: NfcStampInput }) =>
  invokeAppApi<StampResult>("stampVisitByNfc", args.data);

export const adminTestStampVisit = (args: { data: AdminStampInput }) =>
  invokeAppApi<StampResult>("adminTestStampVisit", args.data);

export const setStaffNfcToken = (args: { data: SetTokenInput }) =>
  invokeAppApi<{ token: string }>("setStaffNfcToken", args.data);
