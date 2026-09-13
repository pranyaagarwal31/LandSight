import numpy as np
from sklearn.metrics import (
    accuracy_score, brier_score_loss, confusion_matrix, f1_score, log_loss,
    mean_absolute_error, precision_score, r2_score, recall_score,
    roc_auc_score, root_mean_squared_error,
)

from ..schemas.performance import ClassificationMetrics, ConfusionMatrix, EvaluationMetrics, RegressionMetrics
from .dataset import DELAY_THRESHOLD_DAYS


def predictions(classifier, regressor, features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    positive_index = list(classifier.classes_).index(1)
    probabilities = classifier.predict_proba(features)[:, positive_index].astype(float)
    delays = np.floor(np.maximum(0, regressor.predict(features)) + 0.5).astype(int)
    return probabilities, delays


def evaluate(target_delays: np.ndarray, probabilities: np.ndarray, predicted_delays: np.ndarray) -> EvaluationMetrics:
    labels = (target_delays > DELAY_THRESHOLD_DAYS).astype(int)
    predicted_labels = (probabilities >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(labels, predicted_labels, labels=[0, 1]).ravel()
    return EvaluationMetrics(
        records=len(labels),
        classification=ClassificationMetrics(
            accuracy=float(accuracy_score(labels, predicted_labels)),
            precision=float(precision_score(labels, predicted_labels, zero_division=0)),
            recall=float(recall_score(labels, predicted_labels, zero_division=0)),
            f1=float(f1_score(labels, predicted_labels, zero_division=0)),
            roc_auc=float(roc_auc_score(labels, probabilities)) if len(np.unique(labels)) == 2 else None,
            brier_score=float(brier_score_loss(labels, probabilities)),
            log_loss=float(log_loss(labels, probabilities, labels=[0, 1])),
            confusion_matrix=ConfusionMatrix(true_positive=int(tp), false_positive=int(fp), true_negative=int(tn), false_negative=int(fn)),
        ),
        regression=RegressionMetrics(
            mae=float(mean_absolute_error(target_delays, predicted_delays)),
            rmse=float(root_mean_squared_error(target_delays, predicted_delays)),
            r2=float(r2_score(target_delays, predicted_delays)),
        ),
    )


def selection_loss(metrics: EvaluationMetrics) -> float:
    return metrics.classification.log_loss + metrics.regression.mae / DELAY_THRESHOLD_DAYS
