export type MembershipType =
    | "visitor"
    | "congregant"
    | "member"
    | "minister"
    | "staff"
    | "other";


export type PersonListItem = {
    id: string;

    full_name: string;

    preferred_name: string | null;

    email: string | null;

    phone: string | null;

    birth_date: string | null;

    record_status:
        | "active"
        | "inactive"
        | "archived";

    membership_type: MembershipType;

    unit_relationship_type: string;

    unit_membership_status: string;

    created_at: string;
};


export const MEMBERSHIP_LABELS:
    Record<
        MembershipType,
        string
    > = {
    visitor: "Visitante",
    congregant: "Congregado",
    member: "Membro",
    minister: "Ministro",
    staff: "Equipe",
    other: "Outro",
};