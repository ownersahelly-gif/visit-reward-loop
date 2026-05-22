import { invokeAppApi } from "./edge";

type AddStaffInput = {
  restaurantId: string;
  email: string;
  password: string;
  fullName: string;
  label?: string;
};

export const addStaffAccount = (args: { data: AddStaffInput }) =>
  invokeAppApi<{ ok: true }>("addStaffAccount", args.data);

export const removeStaffAccount = (args: { data: { staffId: string } }) =>
  invokeAppApi<{ ok: true }>("removeStaffAccount", args.data);
