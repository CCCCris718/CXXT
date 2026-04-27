package redlib.backend.service;

import redlib.backend.vo.NotebookCategoryStatVO;

import java.util.List;

public interface NotebookStatisticsService {
    List<NotebookCategoryStatVO> categoryCounts();
}
