import { t } from "elysia";

export namespace SaveDataModel {
	// Request validation
	export const getPathParams = t.Object({
		steamid: t.String({
			minLength: 1,
			description: "Steam Application ID"
		})
	});

	// Response models
	export const saveLocationResponse = t.Object({
		success: t.Boolean(),
		message: t.String(),
		data: t.Optional(t.Record(t.String(), t.String()))
	});

	export const errorResponse = t.Object({
		success: t.Literal(false),
		message: t.String()
	});

	// TypeScript types
	export type GetPathParams = typeof getPathParams.static;
	export type SaveLocationResponse = typeof saveLocationResponse.static;
	export type ErrorResponse = typeof errorResponse.static;

	// Internal types for service layer
	export interface SaveLocationsObject {
		[key: string]: string;
	}

	export interface CargoQueryPageId {
		cargoquery: {
			title: {
				PageID: string;
			};
		}[];
	}

	export interface ParseQueryPageContent {
		parse: {
			title: string;
			pageid: number;
			wikitext: {
				"*": string;
			};
		};
	}
}