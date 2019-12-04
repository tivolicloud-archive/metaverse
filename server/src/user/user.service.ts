import { Injectable, OnModuleInit, NotFoundException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ObjectID } from "bson";
import { GridFSBucket } from "mongodb";
import { Connection, Model } from "mongoose";
import fetch from "node-fetch";
import * as sharp from "sharp";
import { AuthSignUpDto } from "../auth/auth.dto";
import { derPublicKeyHeader } from "../common/der-public-key-header";
import { heartbeat, HeartbeatSession } from "../common/heartbeat";
import { MulterFile } from "../common/multer-file.model";
import { patchObject, patchDoc } from "../common/utils";
import { DomainService } from "../domain/domain.service";
import {
	UserAvailability,
	UserSettingsDto,
	UserUpdateLocation,
	UserUpdateLocationDto,
} from "./user.dto";
import { User } from "./user.schema";
import { UserSettings } from "./user-settings.schema";
import uuid = require("uuid");

export interface UserSession {
	id: string;
	userId: string;

	minutes: number;

	location: UserUpdateLocation;
}

@Injectable()
export class UserService implements OnModuleInit {
	private domainService: DomainService;
	public images: GridFSBucket;

	constructor(
		@InjectModel("user") private readonly userModel: Model<User>,

		@InjectModel("user.settings")
		private readonly userSettingsModel: Model<UserSettings>,

		@InjectConnection() private connection: Connection,

		private moduleRef: ModuleRef,
	) {
		this.images = new GridFSBucket(connection.db, {
			bucketName: "user.images",
		});
	}

	onModuleInit() {
		this.domainService = this.moduleRef.get(DomainService, {
			strict: false,
		});
	}

	// current online users. this can get big!
	sessions: { [username: string]: UserSession & HeartbeatSession } = {};

	findByUsername(username: string) {
		// https://stackoverflow.com/a/45650164
		let loginRegExp = new RegExp(
			"^" + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$",
			"i",
		);
		return this.userModel.findOne({ username: loginRegExp });
	}

	findByEmail(email: string) {
		let loginRegExp = new RegExp(
			"^" + email.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$",
			"i",
		);
		return this.userModel.findOne({ email: loginRegExp });
	}

	findByUsernameOrEmail(username: string) {
		let loginRegExp = new RegExp(
			"^" + username.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$",
			"i",
		);
		return this.userModel.findOne({
			$or: [{ username: loginRegExp }, { email: loginRegExp }],
		});
	}

	findById(idStr: string) {
		try {
			const id = new ObjectID(idStr);
			return this.userModel.findById(id);
		} catch (err) {
			return null;
		}
	}

	findByUsernameRegex(regexp: RegExp) {
		return this.userModel.findOne({
			username: regexp,
		});
	}

	async createUser(authSignUpDto: AuthSignUpDto, hash: string) {
		return await new this.userModel({
			username: authSignUpDto.username,
			email: authSignUpDto.email,
			hash,
		}).save();
	}

	async changeUserImage(user: User, file: MulterFile) {
		return new Promise(async (resolve, reject) => {
			await new Promise(resolve => {
				this.images.delete(user.id, err => {
					resolve();
				});
			});

			const stream = sharp(file.buffer)
				.resize(128, 128, {
					fit: "cover",
					position: "centre",
				})
				.jpeg({
					quality: 80,
				});

			stream.pipe(
				this.images.openUploadStreamWithId(user._id, null, {
					contentType: "image/jpg",
				}),
			);

			stream.on("error", err => {
				reject(err);
			});

			stream.on("end", () => {
				resolve();
			});
		});
	}

	async changeUserImageFromUrl(user: User, imageUrl: string) {
		try {
			const res = await fetch(imageUrl);
			const buffer = await res.buffer();

			return this.changeUserImage(user, {
				fieldname: "",
				originalname: "",
				encoding: "",
				mimetype: "",
				buffer,
			});
		} catch (err) {
			return;
		}
	}

	async findAll() {
		return this.userModel.find({});
	}

	async heartbeatUser(user: User) {
		const session = heartbeat<UserSession>(
			this.sessions,
			user.username,
			session => {
				// initialize
				session.id = uuid();
				session.userId = user._id;
				session.minutes = 0;
				session.location = {
					availability: UserAvailability.none,
					connected: false,
					domain_id: null,
					network_address: "",
					network_port: "",
					node_id: null,
					path: "",
					place_id: null,
				};
			},
			session => {
				// clean up session from domains
				const domainId = session.location.domain_id;
				if (domainId == null) return;

				const domainSession = this.domainService.sessions[domainId];
				if (domainSession == null) return;

				const i = domainSession.users.indexOf(session);
				domainSession.users.splice(i, 1);
			},
			1000 * 30, // maybe 15
		);

		// minutes since online
		const minutes = Math.floor((+new Date() - +session._since) / 1000 / 60);

		// session.minutes needs to be updated
		if (session.minutes < minutes) {
			const minutesToAddToUser = minutes - session.minutes;
			session.minutes = minutes; // sync again

			// update user
			user.minutes += minutesToAddToUser;
			await user.save();
		}

		return session.id;
	}

	async setPublicKey(user: User, buffer: Buffer) {
		const publicKey =
			Buffer.concat([derPublicKeyHeader, buffer])
				.toString("base64")
				.match(/.{1,60}/g)
				.join(" ") + " ";

		user.publicKey = publicKey;
		return await user.save();
	}

	async setUserLocation(
		user: User,
		userUpdateLocationDto: UserUpdateLocationDto,
	) {
		await this.heartbeatUser(user);
		let session = this.sessions[user.username];

		patchObject(session.location, userUpdateLocationDto.location);

		// update user in domain
		if (userUpdateLocationDto.location.domain_id) {
			const domainId = userUpdateLocationDto.location.domain_id;

			const domainSession = this.domainService.sessions[domainId];
			if (domainSession != null) {
				if (!domainSession.users.includes(session)) {
					domainSession.users.push(session);
				}
			}
		}

		// return session id
		return session.id;
	}

	getUserSettings(user: User) {
		return this.userSettingsModel.findById(user._id);
	}

	async changeUserSettings(user: User, userSettingsDto: UserSettingsDto) {
		const userSettings = await this.getUserSettings(user);

		if (userSettings == null) {
			// create new user settings
			const newUserSettings = new this.userSettingsModel({
				_id: user._id,
				...userSettingsDto,
			});
			await newUserSettings.save();
		} else {
			// update user settings
			patchDoc(userSettings, userSettingsDto);
			await userSettings.save();
		}
	}
}
