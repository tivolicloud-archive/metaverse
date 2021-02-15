import { Component, OnInit } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map } from "rxjs/operators";

type Platform = "windows" | "macos" | "linux";
interface Release {
	version: string;
	releaseDate: Date;
	platforms: Record<
		Platform,
		{
			url: string;
			filename: string;
			size: string;
			sha512: string;
		}
	>;
}

@Component({
	selector: "app-download",
	templateUrl: "./download.component.html",
	styleUrls: ["./download.component.scss"],
})
export class DownloadComponent implements OnInit {
	// os: Platform = "windows";

	loaded = false;
	showExperimental = false;

	release: Release = null;

	constructor(private http: HttpClient) {}

	ngOnInit() {
		// TODO: preload if on home component so download is more instant
		this.getLatest();
	}

	private bytesToMB(bytes: number) {
		return Math.floor(bytes / 1000 / 1000);
	}

	getLatest() {
		// if (navigator.platform.indexOf("Win") !== -1) this.os = "windows";
		// if (navigator.platform.indexOf("Mac") !== -1) this.os = "macos";

		this.http
			.get<Release>("/api/releases/latest")
			.pipe(
				map(release => {
					release.releaseDate = new Date(release.releaseDate);
					for (const platform of Object.keys(release.platforms)) {
						release.platforms[platform].size =
							this.bytesToMB(release.platforms[platform].size) +
							" MB";
					}
					return release;
				}),
			)
			.subscribe(release => {
				this.release = release;
				this.loaded = true;
			});
	}
}
