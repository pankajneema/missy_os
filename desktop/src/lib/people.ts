export type PersonCategory = "family" | "friend" | "work" | "important";

export interface Person {
  id: string;
  category: PersonCategory;
  name: string;
  photo?: string;
  relationship: string;
  birthday?: string;
  location?: string;
  profession?: string;
  company?: string;
  role?: string;
  about?: string;
  personality?: string;
  likes?: string;
  dislikes?: string;
  memories?: string;
  notes?: string;
  howMet?: string;
  knownSince?: string;
  projects?: string;
  communicationStyle?: string;
  parentIds?: string[];
}

export interface PersonCategoryConfig {
  category: PersonCategory;
  storageKey: string;
  title: string;
  singular: string;
  description: string;
  relationshipLabel: string;
  relationshipOptions: string[];
  showTree?: boolean;
}

export const PEOPLE_CATEGORIES: Record<PersonCategory, PersonCategoryConfig> = {
  family: {
    category: "family",
    storageKey: "people.family",
    title: "Family",
    singular: "family member",
    description: "Your family tree — parents, siblings, spouse, children, and everyone else.",
    relationshipLabel: "Relationship",
    relationshipOptions: [
      "Father",
      "Mother",
      "Brother",
      "Sister",
      "Spouse",
      "Child",
      "Grandparent",
      "Uncle",
      "Aunt",
      "Cousin",
    ],
    showTree: true,
  },
  friend: {
    category: "friend",
    storageKey: "people.friends",
    title: "Friends",
    singular: "friend",
    description: "The important people in your social life.",
    relationshipLabel: "Category",
    relationshipOptions: ["Best Friend", "Close Friend", "Friend", "Mentor", "Former Friend", "Important Person"],
  },
  work: {
    category: "work",
    storageKey: "people.work",
    title: "Work & People",
    singular: "person",
    description: "People connected to your professional life.",
    relationshipLabel: "Relationship",
    relationshipOptions: [
      "Manager",
      "Colleague",
      "Employee",
      "Founder",
      "Co-founder",
      "Client",
      "Investor",
      "Mentor",
      "Recruiter",
      "Business Partner",
    ],
  },
  important: {
    category: "important",
    storageKey: "people.important",
    title: "Important People",
    singular: "person",
    description: "Anyone important who isn't family, a friend, or a colleague.",
    relationshipLabel: "Relationship",
    relationshipOptions: ["Teacher", "Advisor", "Doctor", "Lawyer", "Mentor", "Neighbor", "Personal Contact"],
  },
};

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
