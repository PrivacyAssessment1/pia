import { Injectable } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { Http } from '@angular/http';

import { Pia } from './pia.model';
import { Evaluation } from 'app/entry/entry-content/evaluations/evaluation.model';
import { Answer } from 'app/entry/entry-content/questions/answer.model';
import { Measure } from 'app/entry/entry-content/measures/measure.model';
import { Comment } from 'app/entry/entry-content/comments/comment.model';
import { Attachment } from 'app/entry/attachments/attachment.model';

import { ModalsService } from 'app/modals/modals.service';
import { EvaluationService } from 'app/entry/entry-content/evaluations/evaluations.service';
import { ActionPlanService } from 'app/entry/entry-content/action-plan//action-plan.service';

@Injectable()
export class PiaService {

  pias: any[];
  pia: Pia = new Pia();
  answer: Answer = new Answer();
  data: { sections: any };
  sidStatus = {};

  constructor(private _router: Router, private route: ActivatedRoute,
              private _evaluationService: EvaluationService,
              private _modalsService: ModalsService, private http: Http) {
                /* TODO : move the JSON loading */
                this.http.request('/assets/files/pia_architecture.json').map(res => res.json()).subscribe(data => {
                  this.data = data;
                });
              }

  /**
   * Gets the PIA.
   * @return the PIA object.
   */
  async getPIA() {
    return new Promise((resolve, reject) => {
      const piaId = parseInt(this.route.snapshot.params['id'], 10);
      this.pia.get(piaId).then(() => {
        this._evaluationService.setPia(this.pia);
        resolve();
      });
    });
  }

  /**
   * Allows an user to remove a PIA.
   */
  removePIA() {
    const piaID = parseInt(localStorage.getItem('pia-id'), 10);

    // Removes from DB.
    const pia = new Pia();
    pia.delete(piaID);

    /* TODO : refactor this... */
    // Deletes the PIA from the view.
    if (localStorage.getItem('homepageDisplayMode') && localStorage.getItem('homepageDisplayMode') === 'list') {
      document.querySelector('.app-list-item[data-id="' + piaID + '"]').remove();
    } else {
      document.querySelector('.pia-cardsBlock.pia-doingBlock[data-id="' + piaID + '"]').remove();
    }

    localStorage.removeItem('pia-id');
    this._modalsService.closeModal();
  }

  async piaInGlobalValidation() {
    return new Promise((resolve, reject) => {
      // TODO - Count all evaluation_mode
      let countEvaluationMode = 17;
      const measure = new Measure();
      measure.pia_id = this._evaluationService.pia.id;
      const dpoAnswerOk = this._evaluationService.dpoAnswerOk();
      measure.findAll().then((entries: any) => {
        if (entries) {
          countEvaluationMode += entries.length;
        }
        // Count all valid evaluation in DB with global_status === 1
        const evaluation = new Evaluation();
        evaluation.pia_id = this._evaluationService.pia.id;
        evaluation.findAll().then((entries2: any) => {
          const entriesWithGlobalStatus = entries2.filter((e) => {
            return e.global_status === 1;
          });
          resolve((countEvaluationMode === entriesWithGlobalStatus.length) && dpoAnswerOk);
        });
      });
    });
  }

  async setSidStatus() {
    const answer = new Answer();
    const measure = new Measure();
    this.sidStatus = {};
    measure.pia_id = this.pia.id;
    // Check if there is at least one answer
    answer.findAllByPia(this.pia.id).then((entries: any) => {
      if (entries) {
        entries.forEach(element => {
          const ref = element.reference_to.toString().substr(0, 2);
          if (!this.sidStatus[ref]) {
            this.sidStatus[ref] = 1;
          }
        });
      }
      // Check if there is at least one measure
      measure.findAll().then((measures: any) => {
        if (measures && measures.length > 0) {
          this.sidStatus['31'] = 1;
        }
        this.data.sections.forEach(section => {
          section.items.forEach(item => {
            this._evaluationService.isItemIsValidated(section.id, item).then((result: boolean) => {
              const ref = section.id.toString() + item.id.toString();
              if (result && this.sidStatus[ref]) {
                this.sidStatus[ref] = 2;
              }
            })
          });
        });
      });
    });
  }

  async cancelAllValidatedEvaluation() {
    return new Promise((resolve, reject) => {
      let evaluation = new Evaluation();
      evaluation.pia_id = this._evaluationService.pia.id;
      evaluation.findAll().then((entries: any) => {
        entries.forEach(element => {
          evaluation = new Evaluation();
          evaluation.get(element.id).then((entry: any) => {
            /* TODO : entry.status = 0; */
            entry.global_status = 0;
            entry.update();
          });
        });
        resolve();
      });
    });
  }

  /**
   * Allows an user to abandon a treatment (archive a PIA)
   */
  abandonTreatment() {
    this.pia.status = 4;
    this.pia.update().then(() => {
      this._modalsService.closeModal();
      this._router.navigate(['home']);
    });
  }

  async export(id:  number) {
    const pia = new Pia();
    const answer = new Answer();
    const measure = new Measure();
    measure.pia_id = id;
    const evaluation = new Evaluation();
    evaluation.pia_id = id;
    const comment = new Comment();
    comment.pia_id = id;
    // const attachment = new Attachment();
    // attachment.pia_id = id;
    await pia.get(id);
    const data = {
      pia: pia,
      answers: null,
      measures: null,
      evaluations: null,
      comments: null
    }
    const date = new Date().getTime();
    answer.findAllByPia(id).then((answers) => {
      data['answers'] = answers;
      measure.findAll().then((measures) => {
        data['measures'] = measures;
        evaluation.findAll().then((evaluations) => {
          data['evaluations'] = evaluations;
          comment.findAll().then((comments) => {
            data['comments'] = comments;
            // attachment.findAll().then((attachments) => {
              // data['attachments'] = attachments;
              const url = 'data:plain/text,' + JSON.stringify(data);
              const a = document.createElement('a');
              a.href = url;
              a.download = date + '_export_pia_' + id + '.json';
              a.click();
            // });
          });
        });
      });
    });
  }

  async import(file: any) {
    const pia = new Pia();
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = (event: any) => {
      const jsonFile = JSON.parse(event.target.result);
      console.log(jsonFile);
      pia.name = jsonFile.pia.name;
      pia.author_name = jsonFile.pia.author_name;
      pia.evaluator_name = jsonFile.pia.evaluator_name;
      pia.validator_name = jsonFile.pia.validator_name;
      pia.dpo_status = jsonFile.pia.dpo_status;
      pia.dpo_opinion = jsonFile.pia.dpo_opinion;
      pia.concerned_people_opinion = jsonFile.pia.concerned_people_opinion;
      pia.concerned_people_status = jsonFile.pia.concerned_people_status;
      pia.rejected_reason = jsonFile.pia.rejected_reason;
      pia.applied_adjustements = jsonFile.pia.applied_adjustements;
      pia.created_at = jsonFile.pia.created_at;
      pia.status = jsonFile.pia.status;
      pia.dpos_names = jsonFile.pia.dpos_names;
      pia.people_names = jsonFile.pia.people_name;
      pia.created_at = jsonFile.pia.created_at;
      pia.updated_at = jsonFile.pia.updated_at;
      pia.create().then((pia_id: number) => {
        // Create answers
        jsonFile.answers.forEach(answer => {
          const answerModel = new Answer();
          answerModel.pia_id = pia_id;
          answerModel.reference_to = answer.reference_to;
          answerModel.data = answer.data;
          answerModel.created_at = answer.created_at;
          answerModel.updated_at = answer.updated_at;
          answerModel.create();
        });
        // Create measures
        jsonFile.measures.forEach(measure => {
          const measureModel = new Measure();
          measureModel.title = measure.title;
          measureModel.pia_id = pia_id;
          measureModel.content = measure.content;
          measureModel.placeholder = measure.placeholder;
          measureModel.created_at = measure.created_at;
          measureModel.updated_at = measure.updated_at;
          measureModel.create();
        });

        // Create evaluations
        jsonFile.evaluations.forEach(evaluation => {
          const evaluationModel = new Evaluation();
          evaluationModel.pia_id = pia_id;
          evaluationModel.status = 0;
          evaluationModel.pia_id = evaluation.pia_id;
          evaluationModel.reference_to = evaluation.reference_to;
          evaluationModel.action_plan_comment = evaluation.action_plan_comment;
          evaluationModel.evaluation_comment = evaluation.evaluation_comment;
          evaluationModel.evaluation_date = evaluation.evaluation_date;
          evaluationModel.gauges = evaluation.gauges;
          evaluationModel.estimated_evaluation_date = new Date(evaluation.estimated_evaluation_date);
          evaluationModel.person_in_charge = evaluation.person_in_charge;
          evaluationModel.global_status = 0;
          evaluationModel.created_at = evaluation.created_at;
          evaluationModel.updated_at = evaluation.updated_at;
          evaluationModel.create();
        });

        // Create comments
        jsonFile.comments.forEach(comment => {
          const commentModel = new Comment();
          commentModel.pia_id = pia_id;
          commentModel.description = comment.description;
          commentModel.pia_id = comment.pia_id;
          commentModel.reference_to = comment.reference_to;
          commentModel.for_measure = comment.for_measure;
          commentModel.created_at = comment.created_at;
          commentModel.updated_at = comment.updated_at;
          commentModel.create();
        });

        location.reload();
      });
    }
  }
}
