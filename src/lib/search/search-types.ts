export type SearchResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
};

export type SearchCategory =
  | "employees"
  | "payroll"
  | "leave"
  | "attendance"
  | "recruitment"
  | "documents"
  | "training"
  | "reports"
  | "actions";

export type SearchResultGroup = {
  category: SearchCategory;
  label: string;
  items: SearchResultItem[];
};

export type GlobalSearchResponse = {
  groups: SearchResultGroup[];
};
