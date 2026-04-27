package redlib.backend.service;

import redlib.backend.dto.NotebookCategoryDTO;
import redlib.backend.dto.query.NotebookCategoryQueryDTO;
import redlib.backend.vo.NotebookCategoryVO;

import java.util.List;

public interface NotebookCategoryService {
    List<NotebookCategoryVO> list(NotebookCategoryQueryDTO queryDTO);

    Integer add(NotebookCategoryDTO categoryDTO);

    Integer update(NotebookCategoryDTO categoryDTO);

    void delete(List<Integer> ids);
}
