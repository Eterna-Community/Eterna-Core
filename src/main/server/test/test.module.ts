import { ApplicationModule } from "../../../common/app";
import { Module } from "../../../common/decorator/Module";
import { TestProvider } from "./test.provider";

@Module({
	providers: [TestProvider],
})
export class TestModule implements ApplicationModule {
	name: string = "TestModule";
	public async initialize(): Promise<void> {}
	public async cleanup(): Promise<void> {}
}
