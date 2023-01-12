import {
  AfterContentChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ConfigService,
  ConfirmModalService,
  DataSourcesService,
  FormsService,
  SurveysService,
} from '@services';
import { arrayHelpers } from '@helpers';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-data-source-item',
  templateUrl: './data-source-item.component.html',
  styleUrls: ['./data-source-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataSourceItemComponent implements AfterContentChecked, OnInit {
  public provider: any;
  public surveyList: any[];
  public form: FormGroup = this.fb.group({});
  public dataSourceList: any[];
  public selectedSurvey: any;
  public surveyAttributesList: any;
  public currentProviderId: string | null;
  public availableProviders: any[];
  public onCreating: boolean;

  providersData: any;

  constructor(
    private fb: FormBuilder,
    private ref: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private configService: ConfigService,
    private dataSourcesService: DataSourcesService,
    private confirmModalService: ConfirmModalService,
    private surveysService: SurveysService,
    private formsService: FormsService,
    private translate: TranslateService,
  ) {}

  getAvailableProviders(providers: any) {
    const tempProviders: any[] = [];
    for (const key in providers) {
      tempProviders.push({
        id: key.toLowerCase(),
        name: key.toLowerCase(),
        type: providers[key as keyof typeof providers],
      });
    }
    return arrayHelpers.sortArray(tempProviders.filter((provider) => !provider.type));
  }

  ngOnInit(): void {
    this.currentProviderId = this.route.snapshot.paramMap.get('id');
    if (!this.currentProviderId) {
      this.onCreating = true;
    }
    this.getProviders();
  }

  private getProviders(): void {
    const providers$ = this.configService.getProvidersData(true);
    const surveys$ = this.surveysService.get();
    const dataSources$ = this.dataSourcesService.getDataSource();

    combineLatest([providers$, surveys$, dataSources$]).subscribe({
      next: ([providersData, surveys, dataSources]) => {
        this.providersData = providersData;
        this.availableProviders = this.getAvailableProviders(this.providersData.providers);
        this.surveyList = surveys.results;
        this.dataSourceList = this.dataSourcesService.combineDataSource(
          providersData,
          dataSources,
          this.surveyList,
        );
        this.setCurrentProvider();
      },
    });
  }

  public setCurrentProvider(providerId?: any): void {
    if (!this.currentProviderId && !providerId) {
      this.currentProviderId = this.availableProviders[0]?.id as string;
    }
    const id = this.currentProviderId || providerId;
    if (id) {
      this.provider = this.dataSourceList.find((provider) => provider.id === id);
      this.removeControls(this.form.controls);
      this.createForm(this.provider);
      this.addControlsToForm('id', this.fb.control(this.provider.id, Validators.required));
      this.getSurveyAttributes(this.provider.selected_survey);
    } else {
      this.router.navigate(['/settings/data-sources']);
    }
  }

  public getSurveyAttributes(survey: any): void {
    if (!survey) return;
    this.form.patchValue({ form_id: survey });
    this.selectedSurvey = survey;
    const queryParams = {
      order: 'asc',
      orderby: 'priority',
    };
    this.formsService.getAttributes(survey.id, queryParams).subscribe({
      next: (response) => {
        this.surveyAttributesList = response;
        for (const el of this.provider.control_inbound_fields) {
          this.form.patchValue({
            [el.control_label]: this.checkKeyFields(el.control_value),
          });
        }
      },
    });
  }

  ngAfterContentChecked() {
    this.ref.detectChanges();
  }

  private createForm(provider: any) {
    this.addControlsToForm('form_id', this.fb.control(this.provider.selected_survey));
    this.createControls(provider.control_options);
    this.createControls(provider.control_inbound_fields);
  }

  private removeControls(controls: any) {
    for (const [key] of Object.entries(controls)) {
      this.form.removeControl(key);
    }
  }

  private createControls(controls: any[]) {
    for (const control of controls) {
      const validatorsToAdd = [];

      if (control?.control_rules) {
        for (const [key] of Object.entries(control.control_rules)) {
          switch (key) {
            case 'required':
              validatorsToAdd.push(Validators.required);
              break;
            default:
              break;
          }
        }
      }
      this.addControlsToForm(
        control.control_label,
        this.fb.control(control.control_value, validatorsToAdd),
      );
    }
  }

  private addControlsToForm(name: string, control: AbstractControl) {
    this.form.addControl(name, control);
  }

  public async turnOffDataSource(event: any): Promise<void> {
    if (!event.checked) {
      this.providersData.providers[this.provider.id] = event.checked;
      const confirmed = await this.confirmModalService.open({
        title: this.translate.instant(`settings.data_sources.provider_name`, {
          providerName: this.provider.name,
        }),
        description: this.translate.instant(
          'settings.data_sources.do_you_really_want_to_disconnect',
        ),
        confirmButtonText: this.translate.instant('app.yes_delete'),
        cancelButtonText: this.translate.instant('app.no_go_back'),
      });
      if (!confirmed) {
        this.provider.available_provider = true;
        return;
      }
    }

    this.providersData.providers[this.provider.id] = event.checked;
    this.configService.updateProviders(this.providersData).subscribe(() => {
      this.router.navigate(['/settings/data-sources']);
    });
    this.onCreating = false;
  }

  public saveProviderData(): void {
    if (this.form.value.form_id) {
      for (const field of this.provider.control_inbound_fields) {
        this.form.patchValue({
          [field.control_label]: this.fillForApi(
            this.filterAttributes('key', this.form.controls[field.control_label].value),
          ),
        });
      }
    }

    for (const provider in this.providersData) {
      if (provider === this.form.value.id) {
        for (const providerKey in this.providersData[provider]) {
          this.providersData[provider][providerKey] = this.form.value[providerKey];
        }
        if (this.provider.visible_survey) {
          this.providersData[provider].form_id = this.form.value.form_id.id;
          if (this.providersData[provider].form_id) {
            let obj: any = {};
            for (const field of this.provider.control_inbound_fields) {
              obj[field.key] = this.form.value[field.control_label];
            }
            this.providersData[provider].inbound_fields = obj;
          }
        } else {
          delete this.providersData[provider].form_id;
          delete this.providersData[provider].inbound_fields;
        }
      }
    }

    this.configService.updateProviders(this.providersData).subscribe(() => {
      this.router.navigate(['/settings/data-sources']);
    });
  }

  private checkKeyFields(field: string): any {
    if (field === 'title' || field === 'content') {
      return this.filterAttributes('type', field === 'title' ? field : 'description')?.key;
    } else if (field) {
      return field.replace(/values./gi, '');
    }
  }

  private filterAttributes(param: string, value: string) {
    return this.surveyAttributesList.find((el: any) => el[param] === value);
  }

  private fillForApi(obj: any): string {
    if (!obj) return '';
    if (obj.type === 'title' || obj.type === 'description') {
      return obj.type === 'title' ? obj.type : 'content';
    } else {
      return `values.${obj.key}`;
    }
  }
}