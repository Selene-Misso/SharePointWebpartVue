import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class DefaultLayout extends Vue {
    @Prop() public description: string;
}