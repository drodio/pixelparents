import { describe, it, expect } from "vitest";
import {
  coerceAge16Status,
  canShowStudentContact,
  isAge16Pending,
  resolveStudentContact,
} from "./contact-visibility";

describe("coerceAge16Status — fails closed", () => {
  it("keeps valid statuses", () => {
    expect(coerceAge16Status("none")).toBe("none");
    expect(coerceAge16Status("pending")).toBe("pending");
    expect(coerceAge16Status("certified")).toBe("certified");
  });
  it("maps NULL / undefined / garbage to 'none' (masked), never certified", () => {
    expect(coerceAge16Status(null)).toBe("none");
    expect(coerceAge16Status(undefined)).toBe("none");
    expect(coerceAge16Status("CERTIFIED")).toBe("none");
    expect(coerceAge16Status(1)).toBe("none");
    expect(coerceAge16Status("")).toBe("none");
  });
});

describe("canShowStudentContact", () => {
  it("only 'certified' unmasks the student's own contact", () => {
    expect(canShowStudentContact("certified")).toBe(true);
    expect(canShowStudentContact("pending")).toBe(false);
    expect(canShowStudentContact("none")).toBe(false);
    expect(canShowStudentContact(null)).toBe(false);
  });
});

describe("isAge16Pending", () => {
  it("is true only for a pending self-request", () => {
    expect(isAge16Pending("pending")).toBe(true);
    expect(isAge16Pending("none")).toBe(false);
    expect(isAge16Pending("certified")).toBe(false);
  });
});

describe("resolveStudentContact", () => {
  const parentEmail = "parent@example.com";
  const studentEmail = "student@example.com";

  it("shows the student's own contact ONLY when certified + present", () => {
    expect(
      resolveStudentContact({ status: "certified", studentEmail, parentEmail }),
    ).toEqual({ email: studentEmail, usingParentContact: false });
  });

  it("masks with the parent's contact when not certified", () => {
    for (const status of ["none", "pending", null, "garbage"]) {
      expect(
        resolveStudentContact({ status, studentEmail, parentEmail }),
      ).toEqual({ email: parentEmail, usingParentContact: true });
    }
  });

  it("falls back to the parent's contact when certified but the student has no email", () => {
    expect(
      resolveStudentContact({ status: "certified", studentEmail: null, parentEmail }),
    ).toEqual({ email: parentEmail, usingParentContact: true });
  });

  it("returns null email (still flagged parent) when neither exists", () => {
    expect(
      resolveStudentContact({ status: "none", studentEmail: null, parentEmail: null }),
    ).toEqual({ email: null, usingParentContact: true });
  });

  it("trims blank strings to null", () => {
    expect(
      resolveStudentContact({ status: "certified", studentEmail: "   ", parentEmail }),
    ).toEqual({ email: parentEmail, usingParentContact: true });
  });
});
