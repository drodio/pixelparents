"use client";

import { useState } from "react";
import { US_STATES, COUNTRIES } from "@/lib/options";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { CityAutocomplete } from "@/components/city-autocomplete";
import type { City } from "@/lib/cities";
import { patchSignup, type SignupPatch } from "@/app/signup/actions";
import type { Photo } from "@/lib/db/schema/signups";
import { TagPicker, PhotoUploader } from "./family-form";

// The "complete your account" wizard steps (V2 round 2): city & state, your
// interests, photos — each its own page. These fields previously had NO home in
// onboarding at all (they were only editable later on /family), which was
// exactly the doc's complaint: "you did not ask them to fill in the information
// regarding themselves."
//
// All three save through patchSignup (draft-capable, authorized by the signup
// row id like every other thanks-flow surface) with the shared autosave hook,
// so Continue/Skip never has to block on a save round-trip.

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60";

function useSignupAutoSave(signupId: string) {
  return useAutoSave<SignupPatch>(async (patch) => {
    const r = await patchSignup(signupId, patch);
    if (!r.ok) throw new Error("save failed");
  });
}

export function StepCityState({
  signupId,
  initialCity,
  initialState,
  initialCountry,
}: {
  signupId: string;
  initialCity: string;
  initialState: string;
  initialCountry: string;
}) {
  const [v, setV] = useState({
    city: initialCity,
    state: initialState,
    country: initialCountry || "United States",
  });
  const { queue, status } = useSignupAutoSave(signupId);

  // Mirrors the /family member card: a picked suggestion fills city AND country
  // (+ US state when present); leaving the US clears any stale state so the
  // US-only-state rule holds.
  function pickCity(picked: City) {
    const isUS = picked.country === "United States";
    const nextState = isUS ? (picked.state ?? "") : "";
    setV({ city: picked.name, state: nextState, country: picked.country });
    queue({ city: picked.name, state: nextState, country: picked.country }, true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelCls} htmlFor="onb-city">
          City
        </label>
        <CityAutocomplete
          id="onb-city"
          value={v.city}
          inputClassName={inputCls}
          placeholder="Start typing your city…"
          onCityChange={(city) => {
            setV((prev) => ({ ...prev, city }));
            queue({ city });
          }}
          onSelect={pickCity}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="onb-country">
            Country
          </label>
          <select
            id="onb-country"
            value={v.country}
            onChange={(e) => {
              const country = e.target.value;
              const clearState = country !== "United States" && v.state !== "";
              setV((prev) => ({ ...prev, country, ...(clearState ? { state: "" } : {}) }));
              queue({ country, ...(clearState ? { state: "" } : {}) }, true);
            }}
            className={inputCls}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {v.country === "United States" && (
          <div>
            <label className={labelCls} htmlFor="onb-state">
              State
            </label>
            <select
              id="onb-state"
              value={v.state}
              onChange={(e) => {
                setV((prev) => ({ ...prev, state: e.target.value }));
                queue({ state: e.target.value }, true);
              }}
              className={inputCls}
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <SaveStatus status={status} />
    </div>
  );
}

export function StepInterests({
  signupId,
  initialInterests,
  suggestedInterests,
  isStudent,
}: {
  signupId: string;
  initialInterests: string[];
  suggestedInterests: string[];
  isStudent: boolean;
}) {
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const { queue, status } = useSignupAutoSave(signupId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/55">
        {isStudent
          ? "What are you into? Interests power the directory's shared-interest matching."
          : "What are you into? Other families find you through shared interests."}
      </p>
      <TagPicker
        value={interests}
        onChange={(next) => {
          setInterests(next);
          queue({ parentInterests: next }, true);
        }}
        suggestions={suggestedInterests}
        placeholder="e.g. Biking, Fantasy novels, Robotics…"
      />
      <SaveStatus status={status} />
    </div>
  );
}

export function StepPhotos({
  signupId,
  initialPhotos,
  initialPreviews,
}: {
  signupId: string;
  initialPhotos: Photo[];
  initialPreviews: Record<string, string>;
}) {
  const { queue, status } = useSignupAutoSave(signupId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/55">
        Totally optional — a photo (it doesn&apos;t have to be of you) gives your
        profile some personality. The first one becomes your profile&apos;s main
        photo.
      </p>
      <PhotoUploader
        initialPhotos={initialPhotos}
        initialPreviews={initialPreviews}
        candidates={[]}
        showMainPill
        onSave={(photos) => queue({ photos }, true)}
      />
      <SaveStatus status={status} />
    </div>
  );
}
