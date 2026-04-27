package redlib.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import redlib.backend.model.NotebookUser;

@Mapper
public interface NotebookUserMapper extends BaseMapper<NotebookUser> {
}
